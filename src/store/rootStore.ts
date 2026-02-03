import { makeAutoObservable } from 'mobx';
import Live2dStore from './live2d';

class RootStore {
  live2dStore: Live2dStore;
  constructor() {
    this.live2dStore = new Live2dStore();
    makeAutoObservable(this);
  }
}

export default RootStore;
