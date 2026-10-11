import {DungeonGame} from './shared/engine.mjs';

export class LocalTransport {
  constructor({team='blue',teamBattle=false}={}){
    this.network=false;this.paused=false;this.game=new DungeonGame({mode:'arena',teamBattle,bots:0,roster:[{id:'local',name:'나',team},{id:'practice-ai',name:'연습 AI',team:team==='red'?'blue':'red',bot:true}]});
  }
  sendInput(input){this.game.input('local',this.paused?{}:input);}
  sendCommand(command){if(!this.paused)this.game.command('local',command);}
  update(dt){if(!this.paused)this.game.step(dt);if(this.game.result&&!this.finished){this.finished=true;parent.postMessage({type:'dw_practice_over',gameId:'dungeonwarden'},location.origin);}}
  snapshot(){return this.game.snapshot('local');}
  close(){this.paused=true;this.game.input('local',{});}
}
