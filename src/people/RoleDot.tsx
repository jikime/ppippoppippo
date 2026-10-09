import { roleColors } from '../simulation/layout';
import type { Role } from '../simulation/world';

export function RoleDot({role}:{role:Role}){
  return <span className="role-dot" data-role={role} style={{backgroundColor:roleColors[role]}} aria-hidden="true"/>;
}
