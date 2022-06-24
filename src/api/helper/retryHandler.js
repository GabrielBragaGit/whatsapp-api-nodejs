"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRetryHandler = void 0;
class MessageRetryHandler {
    constructor() {
        this.addMessage = (message) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const id = (_a = message.key.id) !== null && _a !== void 0 ? _a : '';
            // console.log(message);
            this.messagesMap[id] = this.cleanMessage(message);
            return message;
        });
        this.getMessage = (msgKey) => {
            return this.messagesMap[msgKey];
        };
        this.removeMessage = (msgKey) => {
            delete this.messagesMap[msgKey];
        };
        this.getMessageKeys = () => {
            return Object.keys(this.messagesMap);
        };
        this.cleanMessage = (message) => {
            var _a;
            const msg = (_a = message.message) !== null && _a !== void 0 ? _a : {};
            return msg;
        };
        this.messageRetryHandler = (message) => __awaiter(this, void 0, void 0, function* () {
            var _b, _c;
            const msg = this.getMessage((_b = message.id) !== null && _b !== void 0 ? _b : '');
            // Remove msg from map
            this.removeMessage((_c = message.id) !== null && _c !== void 0 ? _c : '');
            return msg;
        });
        this.messagesMap = {};
    }
}
exports.MessageRetryHandler = MessageRetryHandler;
