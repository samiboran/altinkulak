import{c as r,r as l,j as e,A as t}from"./index-Bzc6QzKt.js";import{C as c}from"./clock-CBSUvRSF.js";/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=r("KeyRound",[["path",{d:"M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z",key:"167ctg"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}]]);/**
 * @license lucide-react v0.383.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const o=r("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);function h(){const[a,i]=l.useState("kod"),[n,s]=l.useState(!1);return e.jsx("div",{className:"ak-giris",children:e.jsxs("div",{className:"ak-giris-card",children:[e.jsx(t,{size:40}),e.jsx("h1",{children:"Altınkulak'a katıl"}),e.jsx("p",{className:"ak-giris-lead",children:"Davetli erişim. Davet kodun varsa gir, yoksa bekleme listesine katıl."}),e.jsxs("div",{className:"ak-giris-tabs",children:[e.jsx("button",{className:a==="kod"?"on":"",onClick:()=>{i("kod"),s(!1)},children:"Davet kodu"}),e.jsx("button",{className:a==="bekleme"?"on":"",onClick:()=>{i("bekleme"),s(!1)},children:"Bekleme listesi"})]}),n?e.jsxs("div",{className:"ak-giris-done",children:[e.jsx(c,{size:20}),e.jsx("p",{children:a==="kod"?"Kod doğrulandığında hesabın açılacak.":"Listeye eklendin. Sıran gelince e-posta göndereceğiz."})]}):e.jsxs("div",{className:"ak-giris-form",children:[a==="kod"?e.jsxs("div",{className:"ak-in",children:[e.jsx(d,{size:16}),e.jsx("input",{placeholder:"Davet kodu (örn. AK-XXXX)"})]}):e.jsxs("div",{className:"ak-in",children:[e.jsx(o,{size:16}),e.jsx("input",{placeholder:"E-posta adresin",type:"email"})]}),e.jsx("button",{className:"ak-btn ak-btn-primary",onClick:()=>s(!0),children:a==="kod"?"Doğrula & gir":"Listeye katıl"})]}),e.jsx("p",{className:"ak-giris-foot",children:"Giriş & davet altyapısı backend ile bağlanacak (Supabase). Şimdilik arayüz hazır."})]})})}export{h as default};
