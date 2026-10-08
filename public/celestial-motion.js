// Cubic Hermite motion with one shared, continuous velocity at every anchor.
// Screen discs are exaggerated: limb crossings are deliberately faster than transit.
export function celestialPosition(time, events, width, radius) {
  if(!Number.isFinite(time)||!Number.isFinite(width)||!Number.isFinite(radius)||width<=0||radius<=0)return null;
  const {rise,riseEnd,transit,setStart,set}=events;
  if(!Number.isFinite(rise)||!Number.isFinite(set)||set<=rise)return null;
  const peak=Number.isFinite(transit)&&transit>rise&&transit<set?transit:(rise+set)/2;
  const complete=width>4*radius&&Number.isFinite(riseEnd)&&Number.isFinite(setStart)&&rise<riseEnd&&riseEnd<peak&&peak<setStart&&setStart<set;
  const times=complete?[rise,riseEnd,peak,setStart,set]:[rise,peak,set];
  const positions=complete?[-radius,radius,width/2,width-radius,width+radius]:[-radius,width/2,width+radius];
  const slopes=times.slice(1).map((t,i)=>(positions[i+1]-positions[i])/(t-times[i]));
  const centre=.65*Math.min(...(complete?[slopes[1],slopes[2]]:slopes));
  let velocities;
  if(complete){
    const left=Math.min(3*slopes[1]-2*centre,slopes[0]),right=Math.min(3*slopes[2]-2*centre,slopes[3]);
    velocities=[2*slopes[0]-left,left,centre,right,2*slopes[3]-right];
  }else velocities=[3*slopes[0]-2*centre,centre,3*slopes[1]-2*centre];
  if(time<=rise)return -radius;if(time>=set)return width+radius;
  const i=times.findIndex((t,j)=>j<times.length-1&&time>=t&&time<=times[j+1]);
  const h=times[i+1]-times[i],u=(time-times[i])/h;
  return (2*u**3-3*u*u+1)*positions[i]+(u**3-2*u*u+u)*h*velocities[i]+(-2*u**3+3*u*u)*positions[i+1]+(u**3-u*u)*h*velocities[i+1];
}

// The bundled lunar rise/set model uses apparent centre altitude + semidiameter
// + 0.09 degrees residual horizon refraction. The lower limb changes the sign.
export function lunarLowerLimb(position){return position.altitude-0.2725*Math.asin(6378.14/position.distance)*180/Math.PI+0.09;}
export function limbCrossing(start,end,position,rising){
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
  let a=start,b=end,fa=lunarLowerLimb(position(a)),fb=lunarLowerLimb(position(b));
  if(!Number.isFinite(fa)||!Number.isFinite(fb)||(rising?!(fa<=0&&fb>=0):!(fa>=0&&fb<=0)))return null;
  for(let i=0;i<32;i++){const mid=(a+b)/2,f=lunarLowerLimb(position(mid));if((f<0)===rising)a=mid;else b=mid;}
  return (a+b)/2;
}
