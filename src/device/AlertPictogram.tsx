import pictograms from '../../device/pictograms.json';
import type { AlertKind } from './alerts';

/** The firmware generator uses these same paths at 56 × 56 pixels. */
export function AlertPictogram({ kind, fresh }: { kind: AlertKind; fresh: boolean }) {
  const id = kind === 'clear' && !fresh ? 'waiting' : kind;
  const icon = pictograms[id];
  return <svg className="device-pictogram" viewBox="0 0 24 24" role="img" aria-label={icon.label}
    data-pictogram={id} fill="none" stroke="currentColor" strokeWidth={12 / 7}
    strokeLinecap="round" strokeLinejoin="round">
    {icon.lines.map((points, index) => <polyline key={index} points={points.map(p => p.join(',')).join(' ')}/>)}
    {icon.circles.map(([cx,cy,r], index) => <circle key={index} cx={cx} cy={cy} r={r}/>)}
  </svg>;
}
