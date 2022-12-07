exports.processButtons = function(buttons) {
    const preparedButtons = []
    
    buttons.map((button, index) => {
      const id = index + 1;
      if (button.type == 'replyButton') {
        preparedButtons.push({
          buttonId: 'id' + id,
          buttonText: {
            displayText: button.title ?? '',
          },
          type: 1,
        });
      }
    });
    return preparedButtons
}

exports.processList = function (list) {
  const preparedList = [{ title: '', rows: [] }];

  list.map((button, index) => {
    // const id = index + 1;
    preparedList[0].rows.push({
      title: `${index + 1}. ${button}`,
      rowId: index + 1,
    });
  });
  return preparedList;
};

exports.processTemplateButton = function(buttons) {
    const preparedButtons = []

    buttons.map((button) => {
        if (button.type == 'replyButton') {
            preparedButtons.push({
                quickReplyButton: {
                    displayText: button.title ?? '',
                },
            })
        }

        if (button.type == 'callButton') {
            preparedButtons.push({
                callButton: {
                    displayText: button.title ?? '',
                    phoneNumber: button.payload ?? '',
                },
            })
        }
        if (button.type == 'urlButton') {
            preparedButtons.push({
                urlButton: {
                    displayText: button.title ?? '',
                    url: button.payload ?? '',
                },
            })
        }
    })
    return preparedButtons
}
