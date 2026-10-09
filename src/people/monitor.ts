import type { Person } from '../simulation/world';
import { stateNames } from '../simulation/layout';

export interface PersonObservation {since:number;state:string;goal:string;events:{time:number;title:string;detail:string}[];speeds:{time:number;speed:number}[]}
export class PersonMonitor {
  private revision=-1;
  private data=new Map<string,PersonObservation>();
  capture(people:Person[],time:number,revision:number){
    if(revision!==this.revision){this.data.clear();this.revision=revision;}
    for(const p of people){
      let item=this.data.get(p.id);
      if(!item){item={since:time,state:'',goal:'',events:[],speeds:[]};this.data.set(p.id,item);}
      if(item.state!==p.state||item.goal!==p.goalName){
        if(item.state!==p.state)item.since=time;
        item.events.unshift({time,title:stateNames[p.state],detail:p.goalName});item.events.length=Math.min(24,item.events.length);
        item.state=p.state;item.goal=p.goalName;
      }
      if(!item.speeds.length||time-item.speeds[item.speeds.length-1].time>=1){
        item.speeds.push({time,speed:p.speed});if(item.speeds.length>60)item.speeds.shift();
      }
    }
  }
  get(id:string){return this.data.get(id);}
}
