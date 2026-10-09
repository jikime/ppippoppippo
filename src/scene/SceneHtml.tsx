import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

// Pin labels to the canvas parent. During the first frame, R3F connects its
// event target; following that changing target makes Html recreate a React DOM
// root on the same element before the previous root has finished unmounting.
export function SceneHtml(props:Omit<ComponentProps<typeof Html>,'portal'>) {
  const gl=useThree(state=>state.gl);
  const portal=useMemo(()=>({current:gl.domElement.parentElement!}),[gl]);
  return <Html {...props} portal={portal}/>;
}
