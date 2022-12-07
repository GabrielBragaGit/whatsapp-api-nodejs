/* eslint-disable no-unsafe-optional-chaining */
const QRCode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@adiwajshing/baileys');
const { rmSync } = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { processButtons, processList } = require('../helper/processbtn');
const generateVC = require('../helper/genVc');
const Chat = require('../models/chat.model');
const axios = require('axios');
const config = require('../../config/config');
const downloadMessage = require('../helper/downloadMsg');
const logger = require('pino')();
const msgRetryCounterMap = {};
const { MessageRetryHandler } = require('../helper/retryHandler');
const retryHandler = new MessageRetryHandler();
const { delay } = require('../helper/delay');

class WhatsAppInstance {
  socketConfig = {
    downloadHistory: true,
    msgRetryCounterMap,
    printQRInTerminal: true,
    // browser: ['ContactPlus MD', '', '3.0'],
    browser: ['ContactPlus MD', 'Chrome', '3.0'],
    logger: pino({
      level: 'error',
    }),
    getMessage: async (key) => {
      const msg = await retryHandler.messageRetryHandler(key);
      console.log(`Get message ${JSON.stringify(key)} for resend, ${msg ? 'found' : 'not_found'}`);
      return msg;
    },
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        // || message.templateMessage
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      return message;
    },
  };
  qrCounter = 0;
  key = '';
  authState;
  allowWebhook = false;
  instance = {
    key: this.key,
    chats: [],
    qr: '',
    messages: [],
  };

  axiosInstance = axios.create({
    baseURL: config.webhookUrl,
  });

  constructor(key, allowWebhook = false, webhookUrl = null) {
    this.key = key ? key : uuidv4();
    this.allowWebhook = allowWebhook;
    if (this.allowWebhook && webhookUrl !== null) {
      this.axiosInstance = axios.create({
        baseURL: webhookUrl,
      });
    }
  }

  async SendWebhook(data) {
    if (!this.allowWebhook) return;
    this.axiosInstance.post('', data).catch((error) => {
      console.log('Send WEBHOOK fail: ', error);
      return;
    });
  }

  async init() {
    this.authState = await useMultiFileAuthState(path.join(__dirname, `../sessiondata/${this.key}`));
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);
    this.socketConfig.auth = this.authState.state;
    this.instance.sock = makeWASocket(this.socketConfig);
    this.setHandler();
    // setTimeout(async () => {
    //   try {
    //     let instance = await Chat.find({ key: this.key, 'chat.id': '5580087850000@s.whatsapp.net' });
    //     console.log(instance['chat']);
    //     let teucu = [];
    //     teucu = instance.chat;
    //     console.log(teucu);
    //     console.log(instance);
    //   } catch (error) {
    //     console.log(error);
    //     console.log('error');
    //   }
    // }, 3000);
    return this;
  }

  setHandler() {
    const sock = this.instance.sock;
    // on credentials update save state
    sock?.ev.on('creds.update', this.authState.saveCreds);

    // on socket closed, opened, connecting
    sock?.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // if (connection === 'connecting') {
      //   console.log('CONNECTING');
      //   return;
      // }

      if (connection === 'close') {
        // reconnect if not logged out
        if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
          logger.error(lastDisconnect?.error?.output);
          this.init();
        } else {
          rmSync(path.join(__dirname, `../sessiondata/${this.key}`), { recursive: true, force: true });
          this.instance.online = false;
        }
      } else if (connection === 'open') {
        let alreadyThere = await Chat.findOne({ key: this.key }).exec();
        // if a document already exist don't create new one
        if (!alreadyThere) {
          const saveChat = new Chat({
            key: this.key,
            allowWebhook: this.allowWebhook,
            webhookUrl: this.webhook,
          });
          await saveChat.save();
        }
        this.instance.online = true;
      }

      if (qr) {
        QRCode.toDataURL(qr).then((url) => {
          if (this.qrCounter <= 3) {
            this.qrCounter++;
            this.instance.qr = url;
            // this.SendWebhook({
            //   type: 'update',
            //   message: 'Received QR Code',
            //   key: this.key,
            //   qrcode: url,
            // });
          } else {
            this.instance?.sock?.logout();
            console.log('QR CODE READ TIMEOUT');
          }
        });
      }
    });

    // on receive all chats
    sock?.ev.on('chats.set', async ({ chats }) => {
      // console.log('on receive all chats');
      //   console.log(chats);
      // console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++');
      const receivedChats = chats.map((chat) => {
        return {
          ...chat,
          messages: [],
        };
      });
      this.instance.chats.push(...receivedChats);
      receivedChats.forEach(async (chat) => {
        await this.updateDb(chat);
      });
    });

    // on receive new chat
    sock?.ev.on('chats.upsert', async (newChat) => {
      // console.log('Received new chat');
      // console.log(newChat);
      // console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++');
      const chats = newChat.map((chat) => {
        return {
          ...chat,
          messages: [],
        };
      });
      this.instance.chats.push(...chats);
      chats.forEach(async (chat) => {
        await this.updateDb(chat);
      });
      //   await this.updateDb(this.instance.chats);
    });

    // on chat change
    sock?.ev.on('chats.update', async (changedChat) => {
      // console.log('on chat change');
      // console.log(changedChat);
      // console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++');

      changedChat.map(async (chat) => {
        const index = this.instance.chats.findIndex((pc) => pc.id === chat.id);
        const PrevChat = this.instance.chats[index];
        this.instance.chats[index] = {
          ...PrevChat,
          ...chat,
        };
        await this.updateDb(this.instance.chats[index]);
      });
    });

    //on call
    sock?.ev.on('call', async (call) => {
      if (call[0].status === 'timeout') {
        const webhookData = {};
        webhookData['text'] = {};
        webhookData['text'].id = call[0].id;
        webhookData['text'].fromMe = false;
        webhookData['text'].chatId = call[0].chatId.split('@')[0] + '@c.us';
        webhookData['text'].author = call[0].chatId.split('@')[0] + '@c.us';
        webhookData['text'].time = call[0].date;
        webhookData['text'].type = 'call_log';
        // webhookData['text'].senderName = msg.pushName
        // webhookData['text'].chatName = msg.pushName
        await this.SendWebhook(webhookData);

        // console.log(call);
      }
    });

    // on chat delete
    sock?.ev.on('chats.delete', (deletedChats) => {
      deletedChats.map((chat) => {
        const index = this.instance.chats.findIndex((c) => c.id === chat);
        this.instance.chats.splice(index, 1);
      });
    });

    // on new message
    sock?.ev.on('messages.upsert', (m) => {
      // console.log('on new mssage');
      // console.dir(m.messages[0].message);
      // console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++')
      if (m.type === 'prepend') this.instance.messages.unshift(...m.messages);
      if (m.type !== 'notify') return;

      this.instance.messages.unshift(...m.messages);

      m.messages.map(async (msg) => {
        if (!msg.message) return;
        if (msg.key.fromMe) return;
        const messageType = Object.keys(msg.message)[0];
        if (['protocolMessage', 'senderKeyDistributionMessage'].includes(messageType)) return;

        const webhookData = {
          key: this.key,
          ...msg,
        };
        // console.dir(msg)
        webhookData['text'] = {};
        webhookData['text'].id = msg.key.id;
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
          webhookData['text'].body = msg.message.conversation || msg.message.extendedTextMessage.text;
        }
        webhookData['text'].fromMe = msg.key.fromMe;
        webhookData['text'].author = msg.key.remoteJid.split('@')[0] + '@c.us';
        webhookData['text'].time = msg.messageTimestamp;
        webhookData['text'].chatId = msg.key.remoteJid.split('@')[0] + '@c.us';
        webhookData['text'].type = 'chat';
        webhookData['text'].senderName = msg.pushName;
        webhookData['text'].chatName = msg.pushName;
        webhookData['text'].quotedMsgBody = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || undefined;
        webhookData['text'].quotedMsgId = msg.message.extendedTextMessage?.contextInfo?.stanzaId || undefined;
        // }
        // if (config.webhookBase64 || true) {
        switch (messageType) {
          case 'messageContextInfo':
            webhookData['text'].quotedMsgBody = msg.message.buttonsResponseMessage?.contextInfo?.quotedMessage.buttonsMessage.contentText || undefined;
            webhookData['text'].quotedMsgId = msg.message.buttonsResponseMessage?.contextInfo?.stanzaId || undefined;
            webhookData['text'].body = msg.message.buttonsResponseMessage?.selectedDisplayText || msg.message.listResponseMessage?.title || undefined;
            break;
          case 'templateButtonReplyMessage':
            webhookData['text'].type = 'buttons_response';
            webhookData['text'].quotedMsgBody = msg.message.templateButtonReplyMessage?.contextInfo?.quotedMessage.conversation || undefined;
            webhookData['text'].quotedMsgId = msg.message.templateButtonReplyMessage?.contextInfo?.stanzaId || undefined;
            webhookData['text'].body = msg.message.templateButtonReplyMessage?.selectedDisplayText;
            break;
          case 'imageMessage':
            webhookData['text'].type = 'image';
            webhookData['text'].caption = msg.message.imageMessage.caption;
            webhookData['text'].quotedMsgBody = msg.message.imageMessage?.contextInfo?.quotedMessage?.conversation || undefined;
            webhookData['text'].quotedMsgId = msg.message.imageMessage?.contextInfo?.stanzaId || undefined;
            webhookData['text'].body = await downloadMessage(msg.message.imageMessage, 'image');
            break;
          case 'videoMessage':
            webhookData['text'].type = 'video';
            webhookData['text'].quotedMsgBody = msg.message.videoMessage?.contextInfo?.quotedMessage?.conversation || undefined;
            webhookData['text'].quotedMsgId = msg.message.videoMessage?.contextInfo?.stanzaId || undefined;
            webhookData['text'].body = await downloadMessage(msg.message.videoMessage, 'video');
            break;
          case 'audioMessage':
            webhookData['text'].type = 'ptt';
            webhookData['text'].quotedMsgBody = msg.message.audioMessage?.contextInfo?.quotedMessage?.conversation || undefined;
            webhookData['text'].quotedMsgId = msg.message.audioMessage?.contextInfo?.stanzaId || undefined;
            webhookData['text'].body = await downloadMessage(msg.message.audioMessage, 'audio');
            break;
          case 'documentMessage':
            webhookData['text'].type = 'document';
            webhookData['text'].quotedMsgBody = msg.message.documentMessage?.contextInfo?.quotedMessage?.conversation || undefined;
            webhookData['text'].quotedMsgId = msg.message.documentMessage?.contextInfo?.stanzaId ?? undefined;
            webhookData['text'].caption = msg.message.documentMessage?.fileName;
            webhookData['text'].body = await downloadMessage(msg.message.documentMessage, 'document');
            break;
          case 'contactMessage':
            webhookData['text'].type = 'vcard';
            webhookData['text'].body = JSON.stringify({ displayName: msg.message.contactMessage.displayName || undefined, vcard: msg.message.contactMessage.vcard });
            if (msg.message.contactMessage.contextInfo) {
              webhookData['text'].quotedMsgBody = msg.message.contactMessage.contextInfo?.quotedMessage?.conversation || undefined;
              webhookData['text'].quotedMsgId = msg.message.contactMessage.contextInfo?.stanzaId || undefined;
            }
            break;
        }
        // }
        await this.SendWebhook(webhookData);

        // if (!this.instance.chats.find((c) => c.id === msg.key.remoteJid)) {
        //     const saveChat = new Chat({ key: msg.key.remoteJid })
        //     await saveChat.save()
        // }
      });
    });

    // on acknowledge
    sock?.ev.on('messages.update', async (ack) => {
      //https://adiwajshing.github.io/Baileys/enums/proto.WebMessageInfo.WebMessageInfoStatus.html
      try {
        //check if ack is array
        if (Array.isArray(ack)) {
          ack.forEach(async (acknowledge) => {
            if (acknowledge.key.fromMe) {
              // console.log('on acknowledge')
              //   console.log(acknowledge);
              //   console.log('++++++++++++++++++++++++++++++++++++++++++++++++++++');
              // this.instance.messages.map((msg) => {
              //     if (msg.id === ack.messageId) {
              //         msg.ack = ack.ack
              //     }
              // })
              let status;
              switch (acknowledge.update.status) {
                case 0:
                  status = 'error';
                  break;
                case 1:
                  status = 'pending';
                  break;
                case 2:
                  status = 'sent';
                  break;
                case 3:
                  status = 'delivered';
                  break;
                case 4:
                  status = 'viewed';
                  break;
                case 5:
                  status = 'played';
                  break;
              }

              const webhookData = {
                ack: {
                  id: acknowledge.key.id,
                  chatId: acknowledge.key?.remoteJid?.split('@')[0] + '@c.us',
                  status: status,
                },
              };
              await this.SendWebhook(webhookData);
            }
          });
        }
      } catch (error) {
        logger.error(error);
      }
    });
  }

  async setStatus(status, to) {
    await this.verifyId(this.getWhatsAppId(to));

    const result = await this.instance.sock?.sendPresenceUpdate(status, to);
    return result;
  }

  async getInstanceDetail(key) {
    return {
      instance_key: key,
      phone_connected: this.instance?.online,
      user: this.instance?.online ? this.instance.sock?.user : {},
    };
  }

  getWhatsAppId(id) {
    if (id.includes('@g.us') || id.includes('@s.whatsapp.net')) return id;
    if (id.includes('@c.us')) return id.replace('@c.us', '@s.whatsapp.net');
    return id.includes('-') ? `${id}@g.us` : `${id}@s.whatsapp.net`;
  }

  async verifyId(id) {
    if (id.includes('@g.us')) return true;
    const [result] = await this.instance.sock?.onWhatsApp(this.getWhatsAppId(id));
    if (result?.exists) return true;
    throw new Error('no account exists: ', id);
  }

  async setComposingStatus(to) {
    await this.instance.sock?.presenceSubscribe(this.getWhatsAppId(to));
    await delay(500);
    await this.instance.sock?.sendPresenceUpdate('composing', this.getWhatsAppId(to));
    await delay(Math.random() * (3000 - 1000) + 1000);
    await this.instance.sock?.sendPresenceUpdate('paused', this.getWhatsAppId(to));
  }

  async sendTextMessage(to, message, quotedMsg, deleteKey) {
    try {
      await this.verifyId(this.getWhatsAppId(to));
      await this.setComposingStatus(to);

      if (quotedMsg) {
        const data = await this.instance.sock?.sendMessage(this.getWhatsAppId(to), { text: message }, { quoted: quotedMsg }).then(retryHandler.addMessage);
        return data;
      } else if (deleteKey) {
        const data = await this.instance.sock?.sendMessage(this.getWhatsAppId(to), { delete: deleteKey }).then(retryHandler.addMessage);
        return data;
      } else {
        const data = await this.instance.sock?.sendMessage(this.getWhatsAppId(to), { text: message }).then(retryHandler.addMessage);
        return data;
      }
    } catch (error) {
      logger.error(error);
      throw new Error(error);
    }
  }

  async sendMediaFile(to, file, type, caption = '', filename) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);

    const data = await this.instance.sock
      ?.sendMessage(this.getWhatsAppId(to), {
        mimetype: file.mimetype,
        [type]: file.buffer,
        caption: caption,
        ptt: type === 'audio' ? true : false,
        fileName: filename ? filename : file.originalname,
      })
      .then(retryHandler.addMessage);
    return data;
  }

  async sendUrlMediaFile(to, url, type, mimeType, caption = '') {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);

    const data = await this.instance.sock
      ?.sendMessage(this.getWhatsAppId(to), {
        [type]: {
          url: url,
        },
        caption: caption,
        mimetype: mimeType,
      })
      .then(retryHandler.addMessage);
    return data;
  }

  async DownloadProfile(of) {
    await this.verifyId(this.getWhatsAppId(of));
    const ppUrl = await this.instance.sock?.profilePictureUrl(this.getWhatsAppId(of), 'image');
    return ppUrl;
  }

  async getUserStatus(of) {
    await this.verifyId(this.getWhatsAppId(of));
    const status = await this.instance.sock?.fetchStatus(this.getWhatsAppId(of));
    return status;
  }

  async blockUnblock(to, data) {
    await this.verifyId(this.getWhatsAppId(to));
    const status = await this.instance.sock?.updateBlockStatus(this.getWhatsAppId(to), data);
    return status;
  }

  async sendButtonMessage(to, data) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);
    const buttons = processButtons(data.buttons);

    const result = await this.instance.sock
      ?.sendMessage(this.getWhatsAppId(to), {
        text: data.text ?? '',
        footer: data.footer ?? '',
        buttons: buttons,
        headerType: 1,
      })
      .then(retryHandler.addMessage);
    return result;
  }

  async sendContactMessage(to, data) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);

    const vcard = generateVC(data);
    const result = await this.instance.sock
      ?.sendMessage(await this.getWhatsAppId(to), {
        contacts: {
          displayName: data.fullName,
          contacts: [{ displayName: data.fullName, vcard }],
        },
      })
      .then(retryHandler.addMessage);
    return result;
  }

  async sendListMessage(to, data) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);
    const sections = processList(data.sections);

    const result = await this.instance.sock
      ?.sendMessage(this.getWhatsAppId(to), {
        text: data.text,
        sections: sections,
        buttonText: data.buttonText,
        footer: data.footer,
        title: data.title,
      })
      .then(retryHandler.addMessage);
    return result;
  }

  async sendMediaButtonMessage(to, data) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);

    const result = await this.instance.sock
      ?.sendMessage(this.getWhatsAppId(to), {
        [data.mediaType]: {
          url: data.image,
        },
        footer: data.footerText ?? '',
        caption: data.text,
        templateButtons: processButton(data.buttons),
        mimetype: data.mimeType,
      })
      .then(retryHandler.addMessage);
    return result;
  }

  async sendReactionMessage(to, react) {
    await this.verifyId(this.getWhatsAppId(to));
    await this.setComposingStatus(to);

    const data = await this.instance.sock?.sendMessage(this.getWhatsAppId(to), react).then(retryHandler.addMessage);
    return data;
  }

  // Group Methods
  parseParticipants(users) {
    return users.map((users) => this.getWhatsAppId(users));
  }

  async createNewGroup(name, users) {
    const group = await this.instance.sock?.groupCreate(name, users.map(this.getWhatsAppId));
    return group;
  }

  async addNewParticipant(id, users) {
    try {
      const res = await this.instance.sock?.groupAdd(this.getWhatsAppId(id), this.parseParticipants(users));
      return res;
    } catch {
      return {
        error: true,
        message: 'Unable to add participant, you must be an admin in this group',
      };
    }
  }

  async makeAdmin(id, users) {
    try {
      const res = await this.instance.sock?.groupMakeAdmin(this.getWhatsAppId(id), this.parseParticipants(users));
      return res;
    } catch {
      return {
        error: true,
        message: 'unable to promote some participants, check if you are admin in group or participants exists',
      };
    }
  }

  async demoteAdmin(id, users) {
    try {
      const res = await this.instance.sock?.groupDemoteAdmin(this.getWhatsAppId(id), this.parseParticipants(users));
      return res;
    } catch {
      return {
        error: true,
        message: 'unable to demote some participants, check if you are admin in group or participants exists',
      };
    }
  }

  async getAllGroups() {
    let Chats = await this.getChat();
    return Chats.filter((c) => c.id.includes('@g.us')).map((data, i) => {
      return { index: i, name: data.name, jid: data.id };
    });
  }

  async leaveGroup(id) {
    let Chats = await this.getChat();
    const group = Chats.find((c) => c.id === id);
    if (!group) throw new Error('no group exists');
    return await this.instance.sock?.groupLeave(id);
  }

  async getInviteCodeGroup(id) {
    let Chats = await this.getChat();
    const group = Chats.find((c) => c.id === id);
    if (!group) throw new Error('unable to get invite code, check if the group exists');
    return await this.instance.sock?.groupInviteCode(id);
  }

  // get Chat object from db
  async getChat(key = this.key) {
    let dbResult = await Chat.findOne({ key: key }).exec();
    let ChatObj = dbResult.chat;
    return ChatObj;
  }

  // update db document -> chat
  async updateDb(object) {
    try {
      // const chat = await Chat.findOne({ key: this.key, chat: { $in: [object.id] } });
      const instance = await Chat.findOne({
        key: this.key,
        'chat.id': object.id,
      });
      if (instance) {
        let index = instance.chat.findIndex((c) => c.id === object.id);
        if (JSON.stringify(instance.chat[index]) !== JSON.stringify(object)) {
          await Chat.updateOne({ key: this.key, 'chat.id': object.id }, { $set: { object } });
        }
      } else {
        await Chat.findOneAndUpdate({ key: this.key }, { $addToSet: { chat: object } });
      }

      // if (!chat) {
      //   chat.chat.push(object.id);
      //   chat.save();
      // } else {

      // }
    } catch (e) {
      console.log(e);
      logger.error('Error updating document failed');
    }
  }
}

exports.WhatsAppInstance = WhatsAppInstance;
