/** A lightweight editorial illustration for the Today overview. */
export function FocusMotion(){
  return <div className="focus-motion" aria-hidden="true">
    <span className="focus-motion-orbit focus-motion-orbit-outer"/>
    <span className="focus-motion-orbit focus-motion-orbit-inner"/>
    <svg className="focus-motion-trail" viewBox="0 0 280 220" fill="none"><path pathLength="1" d="M13 171C48 113 88 184 135 115C171 63 213 82 263 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    <div className="focus-motion-card">
      <div className="focus-motion-card-header"><span className="focus-motion-avatar"/><span className="focus-motion-handle"/><span className="focus-motion-dots">···</span></div>
      <div className="focus-motion-picture"><span className="focus-motion-picture-halo"/><span className="focus-motion-picture-core"/></div>
      <div className="focus-motion-card-footer"><span/><span/><span/></div>
    </div>
    <span className="focus-motion-heart">♥</span>
    <span className="focus-motion-arrow">↗</span>
  </div>;
}
