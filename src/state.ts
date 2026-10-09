import { create } from 'zustand';
import { world } from './simulation/world';
import type { Snapshot } from './simulation/world';

export type CameraMode='overview'|'top'|'floor'|'follow';
type UIState={data:Snapshot;selected:string|null;camera:CameraMode;cameraRevision:number;heatmap:boolean;routes:boolean;walls:boolean;night:boolean;cctv:boolean;panel:'overview'|'people'|'events';help:boolean;cinema:boolean;mobilePanel:boolean;quality:'high'|'balanced';renderDpr:number;
  select:(id:string|null)=>void;setCamera:(camera:CameraMode)=>void;toggle:(key:'heatmap'|'routes'|'walls'|'night'|'cctv'|'help'|'cinema'|'mobilePanel')=>void;
  setPanel:(panel:UIState['panel'])=>void;setQuality:(quality:UIState['quality'])=>void;
};
export const useUI=create<UIState>(set=>({data:world.snapshot(),selected:null,camera:'overview',cameraRevision:0,heatmap:false,routes:true,walls:true,night:false,cctv:true,panel:'overview',help:false,cinema:false,mobilePanel:false,quality:'high',renderDpr:Math.min(1.5,window.devicePixelRatio||1),
  select:id=>set({selected:id}),setCamera:camera=>set(s=>({camera,cameraRevision:s.cameraRevision+1})),toggle:key=>set(s=>({[key]:!s[key]})),setPanel:panel=>set({panel}),setQuality:quality=>set({quality,renderDpr:quality==='high'?Math.min(1.5,window.devicePixelRatio||1):1}),
}));
world.subscribe(()=>useUI.setState({data:world.snapshot()}));
