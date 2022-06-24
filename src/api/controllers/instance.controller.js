const { WhatsAppInstance } = require('../class/instance')
const fs = require('fs')
const path = require('path')
const Chat = require('../models/chat.model');
const logger = require('pino')();

//for debug only
exports.checkInstances = async () => {
  setInterval(() => {
    Object.keys(WhatsAppInstances).map(async (key) => {
      console.log(WhatsAppInstances[key].getInstanceDetail(key));
    });
  }, 2500);
};

exports.init = async (req, res) => {
  let stop = false;
  const sessions = await Chat.find();
  sessions.map((chat) => {
    if (chat.key === req.query.key) {
      stop = true;
      return res.status(200).json({ error: true, message: 'Instance already initialized' });
    }
  });
  if (!stop) {
    const key = req.query.key;
    const webhook = !req.query.webhook ? false : req.query.webhook;
    const webhookUrl = !req.query.webhookUrl ? null : req.query.webhookUrl;
    const instance = new WhatsAppInstance(key, webhook, webhookUrl);
    await Chat.updateOne({ key: key }, { key: key, allowWebhook: webhook, webhookUrl: webhookUrl }, { upsert: true });
    // await chat.save()
    const data = await instance.init();
    WhatsAppInstances[data.key] = instance;
    res.json({
      error: false,
      message: 'Initializing successfully',
      key: data.key,
      webhook: {
        enabled: webhook,
        webhookUrl: webhookUrl,
      },
      qrcode: {
        url: req.protocol + '://' + req.headers.host + '/instance/qr?key=' + data.key,
      },
    });
    instanceConnectionTimeout(data.key);
  }
};

exports.qr = async (req, res) => {
  try {
    const qrcode = await WhatsAppInstances[req.query.key]?.instance.qr;
    res.render('qrcode', {
      qrcode: qrcode,
    });
  } catch {
    res.json({
      qrcode: '',
    });
  }
};

exports.qrbase64 = async (req, res) => {
  try {
    const qrcode = await WhatsAppInstances[req.query.key]?.instance.qr;
    res.json({
      error: false,
      message: 'QR Base64 fetched successfully',
      qrcode: qrcode,
    });
  } catch {
    res.json({
      qrcode: '',
    });
  }
};

exports.info = async (req, res) => {
  const instance = WhatsAppInstances[req.query.key];
  let data = '';
  try {
    data = await instance.getInstanceDetail(req.query.key);
  } catch (error) {
    data = {};
  }
  return res.json({
    error: false,
    message: 'Instance fetched successfully',
    // instance_data: data,
    instance_data: data,
  });
};

// exports.restore = async (req, res, next) => {
//     try {
//         let restoredSessions = []
//         const instances = fs.readdirSync(path.join(__dirname, `../sessiondata`))
//         instances.map((file) => {
//             if (file.includes('.json')) {
//                 restoredSessions.push(file.replace('.json', ''))
//             }
//         })
//         restoredSessions.map(async(key) => {
//             const chat = await Chat.findOne({ key: key })
//             const instance = new WhatsAppInstance(key, chat.allowWebhook, chat.webhookUrl)
//             instance.init()
//             WhatsAppInstances[key] = instance
//         })
//         return res.json({
//             error: false,
//             message: 'All instances restored',
//             data: restoredSessions,
//         })
//     } catch (error) {
//         next(error)
//     }
// }

instanceConnectionTimeout = async (key) => {
  setTimeout(async () => {
    if (!WhatsAppInstances[key]?.instance?.online) {
      try {
        logger.error('Instance ' + key + ' will be deleted due to inactivity');
        await WhatsAppInstances[key].instance?.sock?.logout();
        delete WhatsAppInstances[key];
      } catch (error) {
        logger.error(error);
      }
    }
  }, 180000);
};

exports.restoreSessions = () => {
  //check if instance are online already first
  try {
    let restoredSessions = [];
    const instances = fs.readdirSync(path.join(__dirname, `../sessiondata`));
    instances.map((file) => {
      if (!file.includes('.')) {
        restoredSessions.push(file);
      }
    });
    restoredSessions.map(async (key) => {
      const chat = await Chat.findOne({ key: key });
      const instance = new WhatsAppInstance(key, chat.allowWebhook, chat.webhookUrl);
      instance.init();
      WhatsAppInstances[key] = instance;
      instanceConnectionTimeout(key);
    });
    if (instances.length > 1) logger.info(instances.length - 1 + ' instance(s) restored');
  } catch (error) {
    logger.error(error);
  }
};

exports.logout = async (req, res) => {
  let errormsg;
  try {
    await WhatsAppInstances[req.query.key].instance?.sock?.logout();
  } catch (error) {
    errormsg = error;
  }
  return res.json({
    error: false,
    message: 'logout successfull',
    errormsg: errormsg ? errormsg : null,
  });
};

exports.delete = async (req, res) => {
  let errormsg;
  try {
    await WhatsAppInstances[req.query.key].instance?.sock?.logout();
    delete WhatsAppInstances[req.query.key];
  } catch (error) {
    errormsg = error;
  }
  return res.json({
    error: false,
    message: 'Instance deleted successfully',
    data: errormsg ? errormsg : null,
  });
};

exports.list = async (req, res) => {
  if (req.query.active) {
    let instance = Object.keys(WhatsAppInstances).map(async (key) => WhatsAppInstances[key].getInstanceDetail(key));
    let data = await Promise.all(instance);
    return res.json({
      error: false,
      message: 'All active instances',
      data: data,
    });
  } else {
    let instance = [];
    const sessions = await Chat.find();
    // const sessions = fs.readdirSync(path.join(__dirname, `../sessiondata`))
    sessions.map((chat) => {
      // if (file.includes('.json')) {
      instance.push(chat.key);
      // }
    });
    return res.json({
      error: false,
      message: 'All instance listed',
      data: instance,
    });
  }
};
