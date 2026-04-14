import { DomData } from '../../utils/dom.js';

const TEMPLATE_NAME = `sound`;

export class SoundData {
    static async init() {
        game.socket.on(`module.more-activities`, (data) => {
            switch (data.type) {
                case `playSound`:
                    this._playSound(data);
                    break;
            }
        });
    }

    static playSound(soundData) {
        this._playSound(soundData);
        if (soundData.isGlobal)
            game.socket.emit(`module.more-activities`, soundData);
    }

    static _playSound(soundData) {
        foundry.audio.AudioHelper.play(soundData);
    }
}
