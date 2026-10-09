import { useEffect,useState } from 'react';
import { world } from '../simulation/world';
import { densityGrid } from './data';

function capture(){
  const people=world.people.map(p=>({id:p.id,state:p.state,role:p.role,position:{...p.position},speed:p.speed,goalName:p.goalName,profile:p.profile}));
  return {snapshot:world.snapshot(),people,density:densityGrid(people)};
}
// A shared simulation clock: one visual update per simulated second, no invented samples.
export function useTelemetry(){
  const [data,setData]=useState(capture);
  useEffect(()=>{
    let last='';
    const update=()=>{
      const key=`${world.revision}:${Math.floor(world.time)}:${world.controlVersion}:${world.running}:${world.speed}:${world.ready}`;
      if(key!==last){last=key;setData(capture());}
    };
    update();const unsubscribe=world.subscribe(update);return()=>{unsubscribe();};
  },[]);
  return data;
}
