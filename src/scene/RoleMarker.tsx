import { Billboard } from '@react-three/drei';
import { roleColors } from '../simulation/layout';
import type { Role } from '../simulation/world';

// Staff keep a compact world-space marker. The first-aid cross and operator
// diamond identify their jobs even when the uniform occupies only a few pixels.
export function RoleMarker({role,selected=false}:{role:Role;selected?:boolean}){
  const support=role==='operator'||role==='paramedic',color=roleColors[role];
  return <group>
    {support&&<mesh rotation-x={-Math.PI/2} position-y={.025} raycast={()=>null}>
      <ringGeometry args={[.29,.36,32]}/><meshBasicMaterial color={color} transparent opacity={.9} depthWrite={false} toneMapped={false}/>
    </mesh>}
    {selected&&<mesh rotation-x={-Math.PI/2} position-y={.03} raycast={()=>null}>
      <ringGeometry args={[.40,.46,32]}/><meshBasicMaterial color="#ffffff" depthWrite={false} toneMapped={false}/>
    </mesh>}
    {support&&<Billboard position={[0,1.98,0]}>
      <mesh raycast={()=>null}><circleGeometry args={[.16,24]}/><meshBasicMaterial color={color} toneMapped={false}/></mesh>
      {role==='paramedic'?<>
        <mesh position-z={.005} raycast={()=>null}><planeGeometry args={[.20,.06]}/><meshBasicMaterial color="#ffffff" toneMapped={false}/></mesh>
        <mesh position-z={.006} raycast={()=>null}><planeGeometry args={[.06,.20]}/><meshBasicMaterial color="#ffffff" toneMapped={false}/></mesh>
      </>:<mesh position-z={.005} rotation-z={Math.PI/4} raycast={()=>null}><planeGeometry args={[.12,.12]}/><meshBasicMaterial color="#ffffff" toneMapped={false}/></mesh>}
    </Billboard>}
  </group>;
}
