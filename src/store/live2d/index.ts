import { makeAutoObservable } from 'mobx';
import { Live2DModel } from 'pixi-live2d-display';

export class Live2dStore {
  model: Live2DModel | null = null;
  emotion: string | null = null;
  motion: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setModel(model: Live2DModel | null) {
    this.model = model;
  }

  setEmotion(emotion: string | null) {
    this.emotion = emotion;
  }

  setMotion(motion: string | null) {
    this.motion = motion;
  }
}

export default Live2dStore;
