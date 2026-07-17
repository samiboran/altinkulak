import{c}from"./index-CKeTG9k3.js";import{T as u,S as d}from"./ledger-D9KMdON_.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=c("Download",[["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["polyline",{points:"7 10 12 15 17 10",key:"2ggqvy"}],["line",{x1:"12",x2:"12",y1:"15",y2:"3",key:"1vk2je"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=c("Target",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["circle",{cx:"12",cy:"12",r:"6",key:"1vlfrh"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}]]),l="ak_sandbox_v1";function o(){if(typeof localStorage>"u")return[];try{return JSON.parse(localStorage.getItem(l))||[]}catch{return[]}}function s(r){if(!(typeof localStorage>"u"))try{localStorage.setItem(l,JSON.stringify(r))}catch{}}function m(r){const e=String(r.sym||"").trim().toUpperCase(),n=Number(r.plan),t=Number(r.r);if(!e||!["Long","Short"].includes(r.dir)||!Number.isFinite(n)||n<=0||!Number.isFinite(t)||!u.includes(r.tag))return null;const a={id:typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+Math.random().toString(36).slice(2,8),d:new Date().toISOString(),sym:e,setup:d.includes(r.setup)?r.setup:"Diğer",dir:r.dir,plan:Math.round(n*10)/10,r:Math.round(t*10)/10,tag:r.tag},i=o();return i.push(a),s(i),a}function S(){return o().map(r=>({...r}))}function h(r){const e=o(),n=e.filter(t=>t.id!==r);return s(n),n.length<e.length}export{f as D,g as T,m as a,S as l,h as r};
