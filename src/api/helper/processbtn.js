exports.processButtons = function(buttons) {
    const preparedButtons = []
    
    buttons.map((button, index) => {
        if (button.type == 'replyButton') {
            preparedButtons.push({
                buttonId: index,
                buttonText: {
                    displayText: button.title ?? ''
                },
                type: 1
            })
        }
    })

    return preparedButtons
}

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
