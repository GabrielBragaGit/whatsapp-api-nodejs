exports.Delete = async (req, res) => {
  try {
    const data = await WhatsAppInstances[req.query.key].sendTextMessage(req.body.id, undefined, undefined, (key = { id: req.body.messageId }));
    return res.status(201).json({ error: false, data: data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: true, message: error.message });
  }
};
exports.Text = async (req, res) => {
  try {
    let quoted = undefined;
    if (req.body.quoted) {
      quoted = { key: {} };
      quoted.key.id = req.body.quoted.whatsAppMessageId;
      quoted.key.fromMe = req.body.quoted.senderType === 'customer' ? false : true;
      quoted.key.remoteJid = req.body.quoted.customer.chatId;
      switch (req.body.quoted.type) {
        case 'chat':
          quoted.message = {
            conversation: { message: req.body.quoted.body },
          };
          break;
        case 'image':
          quoted.message = {
            imageMessage: {
              caption: req.body.quoted.body,
            },
          };
          break;
        case 'video':
          quoted.message = {
            videoMessage: {
              caption: req.body.quoted.body,
            },
          };
          break;
        case 'ptt':
          quoted.message = {
            audioMessage: {
              message: req.body.quoted.body,
            },
          };
          break;
        case 'document':
          quoted.message = {
            documentMessage: {
              body: req.body.quoted.body,
            },
          };
          break;
      }
    }
    const data = await WhatsAppInstances[req.query.key].sendTextMessage(req.body.id, req.body.message, quoted);
    return res.status(201).json({ error: false, data: data });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: true, message: error.message });
  }
};

exports.Image = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendMediaFile(req.body.id, req.file, 'image', req.body?.caption);
  return res.status(201).json({ error: false, data: data });
};

exports.Video = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendMediaFile(req.body.id, req.file, 'video', req.body?.caption);
  return res.status(201).json({ error: false, data: data });
};

exports.Audio = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendMediaFile(req.body.id, req.file, 'audio');
  return res.status(201).json({ error: false, data: data });
};

exports.Document = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendMediaFile(req.body.id, req.file, 'document', '', req.body.filename);
  return res.status(201).json({ error: false, data: data });
};

exports.SetStatus = async (req, res) => {
  const presenceList = ['unavailable', 'available', 'composing', 'recording', 'paused'];
  if (presenceList.indexOf(req.body.status) === -1) {
    return res.status(400).json({
      error: true,
      message: 'status parameter must be one of ' + presenceList.join(', '),
    });
  }

  const data = await WhatsAppInstances[req.query.key]?.setStatus(req.body.status, req.body.id);
  return res.status(201).json({ error: false, data: data });
};

exports.Mediaurl = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendUrlMediaFile(
    req.body.id,
    req.body.url,
    req.body.type, // Types are [image, video, audio, document]
    req.body.mimetype, // mimeType of mediaFile / Check Common mimetypes in `https://mzl.la/3si3and`
    req.body.caption,
  );
  return res.status(201).json({ error: false, data: data });
};

exports.Button = async (req, res) => {
  // console.log(res.body)
  const data = await WhatsAppInstances[req.query.key].sendButtonMessage(req.body.id, req.body.btndata);
  return res.status(201).json({ error: false, data: data });
};

exports.Contact = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendContactMessage(req.body.id, req.body.vcard);
  return res.status(201).json({ error: false, data: data });
};

exports.List = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendListMessage(req.body.id, req.body.msgdata);
  return res.status(201).json({ error: false, data: data });
};

exports.MediaButton = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendMediaButtonMessage(req.body.id, req.body.btndata);
  return res.status(201).json({ error: false, data: data });
};

exports.ReactionMessage = async (req, res) => {
  const data = await WhatsAppInstances[req.query.key].sendReactionMessage(req.body.id, req.body.react);
  return res.status(201).json({ error: false, data: data });
};
