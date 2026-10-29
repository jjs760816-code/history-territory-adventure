// Percent coordinates. Obstacles include a margin for the character's feet.
export const obstacles = [{ x: 41, y: 13, w: 18, h: 23 }, { x: 5, y: 12, w: 11, h: 16 }, { x: 86, y: 12, w: 9, h: 18 }];
export function walkable(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 5 && x <= 95 && y >= 12 && y <= 78 && !obstacles.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export function nearestWalkable(point) {
  let best, score = Infinity;
  for (let x=6;x<=94;x+=2) for(let y=12;y<=78;y+=2) {
    const next={x,y}, d=distance(point,next);
    if (walkable(x,y) && d<score) {best=next;score=d;}
  }
  return best;
}
const clearSegment = (a,b) => {
  const steps=Math.max(1,Math.ceil(distance(a,b)*2));
  for(let i=0;i<=steps;i++) if(!walkable(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps)) return false;
  return true;
};
// Breadth-first search, followed by visible-segment simplification.
export function findPath(start, end) {
  const from=nearestWalkable(start), to=nearestWalkable(end);
  const key=p=>`${p.x},${p.y}`, queue=[from], previous=new Map([[key(from),null]]);
  for(let i=0;i<queue.length;i++) {
    const at=queue[i];
    if(key(at)===key(to)) {
      const path=[]; let p=at;
      while(p) {path.unshift(p);p=previous.get(key(p));}
      const simplified=[from];
      for(let j=1;j<path.length;) {
        let last=j;
        while(last+1<path.length && clearSegment(simplified.at(-1),path[last+1])) last++;
        simplified.push(path[last]);j=last+1;
      }
      return simplified;
    }
    for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2]]) {
      const p={x:at.x+dx,y:at.y+dy};
      if(!previous.has(key(p)) && walkable(p.x,p.y)) {previous.set(key(p),at);queue.push(p);}
    }
  }
  return [];
}
