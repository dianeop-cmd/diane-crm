import { useState, useEffect } from "react";

// ═══ GOOGLE SHEETS CONFIG ═══
const SHEET_ID = "1NsXy6gdyau2pU_UH0Wj5af3yFQQYPSPC54kBsBHxGdI";
const sheetURL = (name) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;

function parseCSV(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const vals = []; let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ""; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function parseExpediente(row) {
  return {
    ...row,
    rxOD: { esf: row.rxOD_esf||"", cil: row.rxOD_cil||"", eje: row.rxOD_eje||"", av: row.rxOD_av||"" },
    rxOI: { esf: row.rxOI_esf||"", cil: row.rxOI_cil||"", eje: row.rxOI_eje||"", av: row.rxOI_av||"" },
    archivosIds: row.archivosIds ? row.archivosIds.split(",").map(s=>s.trim()).filter(Boolean) : [],
  };
}

async function fetchSheet(name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(sheetURL(name), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (text.trim().startsWith("<!") || text.trim().startsWith("<html")) throw new Error("HTML response");
    var rows = parseCSV(text);
    if (name === "Ventas") rows = rows.map(function(r) { r.monto = parseFloat(r.monto) || 0; return r; });
    return rows;
  } catch(err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ═══ GOOGLE APPS SCRIPT API ═══
const API_URL = "https://script.google.com/macros/s/AKfycbz7c5_KmSwF8aZUjytmkx-OVmf1H8SD115fu7NXEa9bd6M-afWI3DoVYe84hq8Gttln/exec";

async function writeToSheet(sheet, row) {
  try {
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "add", sheet, row }) });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error escribiendo a Sheets:", err);
    return { success: false, error: err.toString() };
  }
}

async function updateInSheet(sheet, id, row) {
  try {
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "update", sheet, id, row }) });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error actualizando en Sheets:", err);
    return { success: false, error: err.toString() };
  }
}

async function deleteFromSheet(sheet, id) {
  try {
    const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({ action: "delete", sheet, id }) });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error borrando de Sheets:", err);
    return { success: false, error: err.toString() };
  }
}

const fmtD = d => { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }); };
const dUntil = d => { if (!d) return Infinity; const t = new Date(d + "T12:00:00"), n = new Date(); n.setHours(0,0,0,0); return Math.ceil((t - n) / 864e5); };
const ini = n => { if (!n) return "?"; return n.split(" ").slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"; };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toISOString().split("T")[0];

const ROLES = {
  admin: { label: "Administrador", color: "#2A7C6F", perms: ["dashboard","pacientes","citas","seguimientos","expediente","archivos","ventas"] },
  opto:  { label: "Optometrista",  color: "#4A7FB5", perms: ["dashboard","pacientes","citas","expediente","archivos"] },
  recep: { label: "Recepcion",     color: "#C49A3C", perms: ["dashboard","pacientes","citas","seguimientos","ventas"] },
};
const can = (role, perm) => ROLES[role]?.perms.includes(perm);

// ── Demo data ───────────────────────────────────────────────────────────────
const D_PAC = [
  {id:"P001",nombre:"Maria Elena Torres",telefono:"443 112 3456",email:"maria.torres@email.com",fechaNac:"1985-03-14",ultimaVisita:"2026-02-20",proximaCita:"2026-03-18",notas:"Prefiere armazones ligeros.",tipo:"Recurrente",fuente:"Recomendacion"},
  {id:"P002",nombre:"Carlos Mendez Ruiz",telefono:"443 223 7890",email:"cmendez@email.com",fechaNac:"1972-08-05",ultimaVisita:"2026-01-15",proximaCita:"2026-04-15",notas:"Convenio FEMSA.",tipo:"Convenio",fuente:"Convenio Empresarial"},
  {id:"P003",nombre:"Ana Sofia Guzman",telefono:"443 334 5678",email:"anaguzman@email.com",fechaNac:"1990-11-22",ultimaVisita:"2026-03-05",proximaCita:"",notas:"Interesada en lentes de contacto.",tipo:"Nuevo",fuente:"Instagram"},
];
const D_CIT = [
  {id:"C001",pacienteId:"P001",paciente:"Maria Elena Torres",fecha:"2026-03-18",hora:"11:00",tipo:"Consulta",estado:"Confirmada",notas:"Revision anual"},
  {id:"C002",pacienteId:"P003",paciente:"Ana Sofia Guzman",fecha:"2026-03-22",hora:"13:00",tipo:"Consulta",estado:"Por confirmar",notas:"Evaluacion lentes de contacto"},
];
const D_SEG = [
  {id:"S001",pacienteId:"P002",paciente:"Carlos Mendez Ruiz",tipo:"Comercial",fechaSeg:"2026-03-20",estado:"Pendiente",mensaje:"WhatsApp con info lentes de contacto."},
];
const D_VEN = [
  {id:"V001",pacienteId:"P001",paciente:"Maria Elena Torres",fecha:"2026-02-20",concepto:"Consulta + Progresivos Varilux",monto:4850,estado:"Pagada",metodo:"Tarjeta"},
];
const D_EXP = [
  {id:"EX001",pacienteId:"P001",fecha:"2026-02-20",optometrista:"Lic. Opt. Diane",motivo:"Revision anual",rxOD:{esf:"-2.50",cil:"-0.50",eje:"180",av:"20/20"},rxOI:{esf:"-2.75",cil:"-0.75",eje:"175",av:"20/20"},addOD:"",addOI:"",dnp:"32/31",pioOD:"14",pioOI:"15",biomicroscopia:"Sin hallazgos.",fondoOjo:"Nervio sano.",diagnostico:"Miopia con astigmatismo estable.",recomendaciones:"Control anual.",proximaRevision:"2027-02-20",archivosIds:[]},
];
const D_ARC = [];

// ── Icons ───────────────────────────────────────────────────────────────────
const IC = {
  dash:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  usr:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  cal:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  pul:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  eye:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  clip:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  bag:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  srch:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  plus:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  pen:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
  wa:<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  ph:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.81.36 1.87.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.94.34 2 .58 2.81.7A2 2 0 0122 16.92z"/></svg>,
  x:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  alrt:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  menu:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  lock:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  up:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  dl:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  chev:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>,
  print:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  receta:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/><polyline points="9 9 10 9"/></svg>,
};

// ── Shared small components ──────────────────────────────────────────────────
const Tag = ({type}) => type ? <span className={"do-tag do-tag-"+type.toLowerCase().replace(/\s+/g,"-")}>{type}</span> : null;
const Av  = ({name,i=0}) => <div className={"do-av do-av-"+["teal","coral","gold","blue"][i%4]}>{ini(name||"?")}</div>;
const WA  = ({phone,msg}) => { if(!phone) return null; return <a href={"https://wa.me/52"+(phone||"").replace(/\D/g,"")+"?text="+encodeURIComponent(msg||"Hola, le escribimos de Diane Opticas.")} target="_blank" rel="noopener noreferrer" className="do-btn do-btn-wa" onClick={e=>e.stopPropagation()}>{IC.wa} WhatsApp</a>; };
const Chip = ({label,active,onClick}) => <button className={"do-chip"+(active?" active":"")} onClick={onClick}>{label}</button>;
const RxCell = ({val}) => <div className="rx-cell"><span className="rx-val">{val||"—"}</span></div>;

// ── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = (msg, type="success") => {
    const id = Date.now();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);
  };
  return {toasts, show};
}
function ToastContainer({toasts}) {
  const colors = {success:"#2A7C6F",error:"#D4726A",info:"#4A7FB5"};
  const icons  = {success:"✓",error:"✕",info:"ℹ"};
  return <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
    {toasts.map(t=><div key={t.id} style={{padding:"12px 18px",borderRadius:10,background:"#fff",border:"1px solid",borderColor:colors[t.type]||colors.info,color:colors[t.type]||colors.info,fontSize:13,fontWeight:500,boxShadow:"0 4px 16px rgba(0,0,0,.1)",display:"flex",gap:10,alignItems:"center",maxWidth:320}}>
      <span style={{width:20,height:20,borderRadius:"50%",background:colors[t.type],color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>{icons[t.type]}</span>
      {t.msg}
    </div>)}
  </div>;
}

// ── Confirm dialog ───────────────────────────────────────────────────────────
function ConfirmModal({msg,onYes,onNo}) {
  return <div className="do-modal-ov" onClick={onNo}><div className="do-modal" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
    <div className="do-modal-hd"><h3>Confirmar</h3><button className="do-close" onClick={onNo}>{IC.x}</button></div>
    <div className="do-modal-body" style={{textAlign:"center",padding:"28px 24px"}}>
      <div style={{fontSize:32,marginBottom:12}}>🗑️</div>
      <p style={{fontSize:14,color:"#4A3F35"}}>{msg}</p>
    </div>
    <div className="do-modal-ft">
      <button className="do-btn do-btn-out" onClick={onNo}>Cancelar</button>
      <button className="do-btn" style={{background:"#D4726A",color:"#fff"}} onClick={onYes}>Eliminar</button>
    </div>
  </div></div>;
}

// ── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({title,onClose,children,footer,wide}) {
  return <div className="do-modal-ov" onClick={onClose}><div className={"do-modal"+(wide?" do-modal-wide":"")} onClick={e=>e.stopPropagation()}>
    <div className="do-modal-hd"><h3>{title}</h3><button className="do-close" onClick={onClose}>{IC.x}</button></div>
    <div className="do-modal-body">{children}</div>
    {footer && <div className="do-modal-ft">{footer}</div>}
  </div></div>;
}

// ── Expediente card ──────────────────────────────────────────────────────────
function ExpedienteCard({ex,archivos,expanded,onToggle,onEdit,onDelete,role,paciente}) {
  const exA = archivos.filter(a=>(ex.archivosIds||[]).includes(a.id));
  const isA = ex.diagnostico && ex.diagnostico.includes("SOSPECHA");
  return <div className={"exp-card"+(expanded?" exp-open":"")}>
    <div className="exp-card-hd" onClick={onToggle}>
      <div><div className="exp-card-date">{fmtD(ex.fecha)}</div><div className="exp-card-motivo">{ex.motivo}</div><div className="exp-card-opto">{ex.optometrista}</div></div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        {isA&&<span className="do-tag do-tag-pendiente" style={{fontSize:10}}>Alerta</span>}
        <button className="do-btn-ic" title="Generar receta para paciente" style={{background:"#E8F5F2",borderColor:"#2A7C6F",color:"#2A7C6F"}} onClick={e=>{e.stopPropagation();generarReceta(ex,paciente);}}>{IC.receta}</button>
        <button className="do-btn-ic" title="Imprimir historia clínica" onClick={e=>{e.stopPropagation();printReceta(ex,paciente);}}>{IC.print}</button>
        {can(role,"expediente")&&<button className="do-btn-ic" title="Editar" onClick={e=>{e.stopPropagation();onEdit(ex)}}>{IC.pen}</button>}
        {can(role,"expediente")&&<button className="do-btn-ic do-btn-ic-d" title="Borrar" onClick={e=>{e.stopPropagation();onDelete(ex.id)}}>{IC.trash}</button>}
        <span className={"exp-chev"+(expanded?" exp-chev-open":"")}>{IC.chev}</span>
      </div>
    </div>
    {expanded&&<div className="exp-card-body">
      {(ex.avscOD||ex.avscOI)&&<div className="exp-section"><div className="exp-sec-title">Agudeza Visual</div>
        <div className="rx-grid" style={{gridTemplateColumns:"40px repeat(3,1fr)"}}>
          <div className="rx-header"></div><div className="rx-header">AVSC</div><div className="rx-header">PH</div><div className="rx-header">AVCC</div>
          <div className="rx-eye">OD</div><RxCell val={ex.avscOD}/><RxCell val={ex.phOD}/><RxCell val={ex.avccOD}/>
          <div className="rx-eye">OI</div><RxCell val={ex.avscOI}/><RxCell val={ex.phOI}/><RxCell val={ex.avccOI}/>
        </div>
      </div>}
      <div className="exp-section"><div className="exp-sec-title">Refraccion Final</div>
        <div className="rx-grid"><div className="rx-header"> </div><div className="rx-header">Esf</div><div className="rx-header">Cil</div><div className="rx-header">Eje</div><div className="rx-header">AV</div><div className="rx-header">Add</div>
        <div className="rx-eye">OD</div><RxCell val={ex.rxOD.esf}/><RxCell val={ex.rxOD.cil}/><RxCell val={ex.rxOD.eje}/><RxCell val={ex.rxOD.av}/><RxCell val={ex.addOD}/>
        <div className="rx-eye">OI</div><RxCell val={ex.rxOI.esf}/><RxCell val={ex.rxOI.cil}/><RxCell val={ex.rxOI.eje}/><RxCell val={ex.rxOI.av}/><RxCell val={ex.addOI}/></div>
        <div className="rx-dnp">DNP: {ex.dnp||"—"} mm</div></div>
      <div className="exp-section"><div className="exp-sec-title">PIO</div><div style={{display:"flex",gap:24,fontSize:14}}><span>OD: <strong style={{color:parseInt(ex.pioOD)>20?"#D4726A":"#2A7C6F"}}>{ex.pioOD} mmHg</strong></span><span>OI: <strong style={{color:parseInt(ex.pioOI)>20?"#D4726A":"#2A7C6F"}}>{ex.pioOI} mmHg</strong></span></div></div>
      {ex.biomicroscopia&&<div className="exp-section"><div className="exp-sec-title">Biomicroscopia</div><div className="exp-text">{ex.biomicroscopia}</div></div>}
      {ex.fondoOjo&&<div className="exp-section"><div className="exp-sec-title">Fondo de Ojo</div><div className="exp-text">{ex.fondoOjo}</div></div>}
      <div className="exp-section"><div className="exp-sec-title">Diagnostico</div><div className={"exp-diag"+(isA?" exp-diag-alert":"")}>{ex.diagnostico}</div></div>
      {ex.recomendaciones&&<div className="exp-section"><div className="exp-sec-title">Recomendaciones</div><div className="exp-text">{ex.recomendaciones}</div></div>}
      {ex.tipoLente&&<div className="exp-section"><div className="exp-sec-title">Tipo de lente</div><span className="do-tag do-tag-recurrente">{ex.tipoLente}</span></div>}
      <div className="exp-section" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div className="exp-sec-title" style={{marginBottom:0}}>Proxima Revision</div><span style={{fontWeight:600,color:"#2A7C6F",fontSize:14}}>{fmtD(ex.proximaRevision)}</span></div>
      {exA.length>0&&<div className="exp-section"><div className="exp-sec-title">Archivos ({exA.length})</div>{exA.map(a=><div key={a.id} className="arc-row"><div className="arc-icon">{a.tipo==="Imagen"?"🖼":"📄"}</div><div className="arc-info"><div className="arc-name">{a.nombre}</div><div className="arc-meta">{a.categoria} - {a.tamano}</div></div><a href={a.url} target="_blank" rel="noopener noreferrer" className="do-btn do-btn-out" style={{fontSize:11,padding:"4px 10px"}}>{IC.dl} Ver</a></div>)}</div>}
    </div>}
  </div>;
}



// ── Imprimir receta ───────────────────────────────────────────────────────────
function printReceta(ex, pac) {
  const nombre = pac ? pac.nombre : "Paciente";
  const tel    = pac ? (pac.telefono||"") : "";
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Receta Optométrica — ${nombre}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@400;500;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif;color:#2D2520;background:#fff;padding:0}
  .page{width:148mm;min-height:100mm;margin:0 auto;padding:10mm 12mm;border:1px solid #e0d8cc}
  .logo{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:#2A7C6F;margin-bottom:2px}
  .tagline{font-size:10px;color:#8B7355;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px}
  .divider{border:none;border-top:2px solid #2A7C6F;margin:8px 0}
  .row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px}
  .label{color:#8B7355;font-weight:600;text-transform:uppercase;letter-spacing:.8px;font-size:10px}
  .val{font-size:13px;font-weight:500}
  .section{margin:10px 0 6px;font-size:10px;font-weight:700;color:#2A7C6F;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e8dfd1;padding-bottom:3px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}
  th{background:#e8f5f2;color:#2A7C6F;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:5px 8px;text-align:center}
  td{padding:6px 8px;text-align:center;border-bottom:1px solid #f3ede4;font-weight:500}
  .eye-label{font-weight:700;color:#2D2520;text-align:left}
  .diag{background:#faf7f2;border-radius:6px;padding:8px 10px;font-size:12px;line-height:1.5;margin-bottom:6px}
  .rec{font-size:11px;color:#4A3F35;line-height:1.5}
  .footer{margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end}
  .firma{text-align:center}
  .firma-line{border-top:1px solid #2D2520;padding-top:4px;font-size:10px;color:#8B7355;margin-top:24px;width:120px}
  .fecha{font-size:10px;color:#8B7355}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{border:none;width:100%;padding:8mm}}
</style></head><body>
<div class="page">
  <div class="logo">Diane Ópticas</div>
  <div class="tagline">Centro de Optometría · Plaza Escala, Morelia</div>
  <hr class="divider"/>
  <div class="row"><span><span class="label">Paciente: </span><span class="val">${nombre}</span></span><span><span class="label">Tel: </span><span class="val">${tel}</span></span></div>
  <div class="row"><span><span class="label">Fecha: </span><span class="val">${fmtD(ex.fecha)}</span></span><span><span class="label">Optometrista: </span><span class="val">${ex.optometrista||"Lic. Opt. Diane"}</span></span></div>
  ${ex.motivo?`<div class="row"><span class="label">Motivo: </span><span style="font-size:12px">${ex.motivo}</span></div>`:""}

  ${(ex.avscOD||ex.avscOI)?`<div class="section">Agudeza Visual</div>
  <table>
    <thead><tr><th></th><th>AVSC</th><th>PH</th><th>AVCC</th></tr></thead>
    <tbody>
      <tr><td class="eye-label">OD</td><td>${ex.avscOD||"—"}</td><td>${ex.phOD||"—"}</td><td>${ex.avccOD||"—"}</td></tr>
      <tr><td class="eye-label">OI</td><td>${ex.avscOI||"—"}</td><td>${ex.phOI||"—"}</td><td>${ex.avccOI||"—"}</td></tr>
    </tbody>
  </table>`:""}
  <div class="section">Refracción</div>
  <table>
    <thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>AV</th><th>Adición</th></tr></thead>
    <tbody>
      <tr><td class="eye-label">OD</td><td>${ex.rxOD_esf||ex.rxOD?.esf||"—"}</td><td>${ex.rxOD_cil||ex.rxOD?.cil||"—"}</td><td>${ex.rxOD_eje||ex.rxOD?.eje||"—"}</td><td>${ex.rxOD_av||ex.rxOD?.av||"—"}</td><td>${ex.addOD||"—"}</td></tr>
      <tr><td class="eye-label">OI</td><td>${ex.rxOI_esf||ex.rxOI?.esf||"—"}</td><td>${ex.rxOI_cil||ex.rxOI?.cil||"—"}</td><td>${ex.rxOI_eje||ex.rxOI?.eje||"—"}</td><td>${ex.rxOI_av||ex.rxOI?.av||"—"}</td><td>${ex.addOI||"—"}</td></tr>
    </tbody>
  </table>
  <div class="row">
    ${ex.dnp?`<span><span class="label">DNP: </span><span style="font-size:12px">${ex.dnp} mm</span></span>`:""}
    ${ex.pioOD?`<span><span class="label">PIO OD: </span><span style="font-size:12px;color:${parseInt(ex.pioOD)>20?"#D4726A":"#2A7C6F"}">${ex.pioOD} mmHg</span></span>`:""}
    ${ex.pioOI?`<span><span class="label">PIO OI: </span><span style="font-size:12px;color:${parseInt(ex.pioOI)>20?"#D4726A":"#2A7C6F"}">${ex.pioOI} mmHg</span></span>`:""}
  </div>

  ${ex.diagnostico?`<div class="section">Diagnóstico</div><div class="diag">${ex.diagnostico}</div>`:""}
  ${ex.recomendaciones?`<div class="section">Recomendaciones</div><div class="rec">${ex.recomendaciones}</div>`:""}
  ${ex.proximaRevision?`<div style="margin-top:8px;font-size:11px;color:#2A7C6F"><strong>Próxima revisión:</strong> ${fmtD(ex.proximaRevision)}</div>`:""}

  <div class="footer">
    <div class="fecha">Generado: ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</div>
    <div class="firma"><div class="firma-line">${ex.optometrista||"Lic. Opt. Diane"}<br/>Optometrista</div></div>
  </div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
  const w = window.open("","_blank","width=600,height=500");
  w.document.write(html);
  w.document.close();
}


// ── Generar receta para paciente ─────────────────────────────────────────────
function generarReceta(ex, pac) {
  const nombre   = pac ? pac.nombre : "Paciente";
  const tel      = pac ? (pac.telefono||"") : "";
  const email    = pac ? (pac.email||"") : "";
  const fechaNac = pac ? fmtD(pac.fechaNac) : "";
  const vigencia = ex.proximaRevision
    ? `Válida hasta: ${fmtD(ex.proximaRevision)}`
    : "Válida por 12 meses a partir de la fecha de emisión";

  const rxRow = (label, esf, cil, eje, add) => `
    <tr>
      <td class="eye">${label}</td>
      <td>${esf||"—"}</td>
      <td>${cil||"—"}</td>
      <td>${eje||"—"}</td>
      <td>${add||"—"}</td>
    </tr>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Receta Optométrica — ${nombre}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@400;500;600&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'DM Sans',sans-serif;color:#2D2520;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;width:148mm;padding:12mm 14mm;box-shadow:0 4px 24px rgba(0,0,0,.12);border-radius:4px;position:relative;overflow:hidden}
  .accent-bar{position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#2A7C6F,#4A9B8C)}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding-top:4px}
  .brand h1{font-family:'Playfair Display',serif;font-size:24px;font-weight:700;color:#2A7C6F;line-height:1}
  .brand p{font-size:9px;color:#8B7355;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px}
  .brand .contact{font-size:10px;color:#8B7355;margin-top:6px;line-height:1.5}
  .badge{background:#E8F5F2;color:#2A7C6F;font-size:10px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.5px;text-transform:uppercase;border:1px solid #b5d9cc}
  .divider{border:none;border-top:1.5px solid #e8dfd1;margin:10px 0}
  .pac-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:10px}
  .pac-field{font-size:11px}
  .pac-label{color:#8B7355;font-size:9px;text-transform:uppercase;letter-spacing:.8px;font-weight:600;display:block;margin-bottom:1px}
  .pac-val{font-weight:600;color:#2D2520;font-size:12px}
  .section-title{font-size:9px;font-weight:700;color:#2A7C6F;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1.5px solid #2A7C6F;padding-bottom:3px;margin:10px 0 7px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#2A7C6F}
  thead th{color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:6px 8px;font-weight:600;text-align:center}
  thead th:first-child{text-align:left}
  tbody tr:nth-child(odd){background:#f8fbfa}
  tbody td{padding:8px;text-align:center;font-weight:600;font-size:13px;color:#2D2520;border-bottom:1px solid #eee}
  .eye{font-weight:700;color:#2A7C6F;text-align:left;font-size:12px}
  .dnp-row{display:flex;gap:24px;margin-top:6px;font-size:11px}
  .dnp-item{display:flex;gap:6px;align-items:center}
  .dnp-label{color:#8B7355;font-weight:600}
  .dnp-val{font-weight:700;color:#2D2520}
  .lente-badge{display:inline-block;background:#EDF3F9;color:#4A7FB5;border:1px solid #b5c9e0;border-radius:4px;padding:5px 12px;font-size:12px;font-weight:600;margin-top:2px}
  .obs-box{background:#faf7f2;border:1px solid #e8dfd1;border-radius:6px;padding:8px 10px;font-size:11.5px;line-height:1.6;color:#4A3F35;margin-top:4px}
  .vigencia{background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:6px 10px;font-size:10px;font-weight:600;color:#7a6000;display:flex;align-items:center;gap:6px;margin-top:10px}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px}
  .fecha-emit{font-size:9px;color:#C4B5A0}
  .firma-area{text-align:center}
  .firma-line{width:130px;border-top:1.5px solid #2D2520;margin:28px auto 0;padding-top:5px;font-size:10px;color:#4A3F35;font-weight:500}
  .firma-cedula{font-size:9px;color:#8B7355;margin-top:2px}
  @media print{
    body{background:#fff;padding:0;display:block}
    .card{box-shadow:none;border-radius:0;width:100%;padding:10mm 12mm}
    @page{size:A5 portrait;margin:0}
  }
</style></head><body>
<div class="card">
  <div class="accent-bar"></div>

  <div class="header">
    <div class="brand">
      <h1>Diane Ópticas</h1>
      <p>Centro de Optometría</p>
      <div class="contact">Plaza Escala · Morelia, Michoacán<br/>dianeopticas.com</div>
    </div>
    <div class="badge">📋 Receta Optométrica</div>
  </div>

  <hr class="divider"/>

  <div class="pac-grid">
    <div class="pac-field"><span class="pac-label">Paciente</span><span class="pac-val">${nombre}</span></div>
    <div class="pac-field"><span class="pac-label">Fecha</span><span class="pac-val">${fmtD(ex.fecha)}</span></div>
    ${fechaNac?`<div class="pac-field"><span class="pac-label">Fecha de nacimiento</span><span class="pac-val">${fechaNac}</span></div>`:""}
    ${tel?`<div class="pac-field"><span class="pac-label">Teléfono</span><span class="pac-val">${tel}</span></div>`:""}
  </div>

  <div class="section-title">Prescripción</div>
  <table>
    <thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th></tr></thead>
    <tbody>
      ${rxRow("OD",ex.rxOD_esf||ex.rxOD?.esf,ex.rxOD_cil||ex.rxOD?.cil,ex.rxOD_eje||ex.rxOD?.eje,ex.addOD)}
      ${rxRow("OI",ex.rxOI_esf||ex.rxOI?.esf,ex.rxOI_cil||ex.rxOI?.cil,ex.rxOI_eje||ex.rxOI?.eje,ex.addOI)}
    </tbody>
  </table>

  ${ex.dnp?`<div class="dnp-row"><div class="dnp-item"><span class="dnp-label">DNP OD:</span><span class="dnp-val">${ex.dnp.split("/")[0]||ex.dnp} mm</span></div>${ex.dnp.includes("/")?`<div class="dnp-item"><span class="dnp-label">DNP OI:</span><span class="dnp-val">${ex.dnp.split("/")[1]} mm</span></div>`:""}</div>`:""}

  ${ex.tipoLente?`<div class="section-title">Tipo de lente</div><div><span class="lente-badge">✦ ${ex.tipoLente}</span></div>`:""}

  ${ex.obsReceta?`<div class="section-title">Indicaciones</div><div class="obs-box">${ex.obsReceta}</div>`:""}

  <div class="vigencia">⏱ ${vigencia}</div>

  <div class="footer">
    <div class="fecha-emit">Emitida el ${new Date().toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"})}</div>
    <div class="firma-area">
      <div class="firma-line">${ex.optometrista||"Lic. Opt. Diane"}</div>
      <div class="firma-cedula">Optometrista · Cédula profesional</div>
    </div>
  </div>
</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

  const w = window.open("","_blank","width=700,height=600");
  w.document.write(html);
  w.document.close();
}

// ── Búsqueda global ──────────────────────────────────────────────────────────
function GlobalSearch({q,pacs,citas,ventas,exps,onSelect}) {
  const ql = q.toLowerCase();
  const rPacs  = pacs.filter(p=>(p.nombre||"").toLowerCase().includes(ql)||(p.telefono||"").includes(ql)).slice(0,4);
  const rCitas = citas.filter(c=>(c.paciente||"").toLowerCase().includes(ql)||(c.tipo||"").toLowerCase().includes(ql)).slice(0,3);
  const rVentas= ventas.filter(v=>(v.paciente||"").toLowerCase().includes(ql)||(v.concepto||"").toLowerCase().includes(ql)).slice(0,3);
  const rExps  = exps.filter(e=>(e.diagnostico||"").toLowerCase().includes(ql)||(e.motivo||"").toLowerCase().includes(ql)).slice(0,2);
  const total  = rPacs.length+rCitas.length+rVentas.length+rExps.length;
  if(total===0) return <div className="gsearch-box"><div className="gsearch-empty">Sin resultados para "{q}"</div></div>;
  return <div className="gsearch-box">
    {rPacs.length>0&&<><div className="gsearch-section">Pacientes</div>{rPacs.map((p,i)=><div key={p.id} className="gsearch-row" onMouseDown={()=>onSelect("pac",p)}><Av name={p.nombre} i={i}/><div><div className="gsearch-name">{p.nombre}</div><div className="gsearch-sub">{p.telefono} · <Tag type={p.tipo}/></div></div></div>)}</>}
    {rCitas.length>0&&<><div className="gsearch-section">Citas</div>{rCitas.map(c=><div key={c.id} className="gsearch-row" onMouseDown={()=>onSelect("cita",c)}><div className="gsearch-icon">📅</div><div><div className="gsearch-name">{c.paciente}</div><div className="gsearch-sub">{fmtD(c.fecha)} · {c.tipo} · <Tag type={c.estado}/></div></div></div>)}</>}
    {rVentas.length>0&&<><div className="gsearch-section">Ventas</div>{rVentas.map(v=><div key={v.id} className="gsearch-row" onMouseDown={()=>onSelect("venta",v)}><div className="gsearch-icon">💰</div><div><div className="gsearch-name">{v.paciente}</div><div className="gsearch-sub">{fmtD(v.fecha)} · ${(v.monto||0).toLocaleString()}</div></div></div>)}</>}
    {rExps.length>0&&<><div className="gsearch-section">Expedientes</div>{rExps.map(e=><div key={e.id} className="gsearch-row" onMouseDown={()=>onSelect("exp",e)}><div className="gsearch-icon">🔬</div><div><div className="gsearch-name">{(e.diagnostico||"").slice(0,50)}</div><div className="gsearch-sub">{fmtD(e.fecha)} · {e.motivo}</div></div></div>)}</>}
  </div>;
}

// ── FichaCliente ─────────────────────────────────────────────────────────────
function FichaCliente({p,citas,segs,ventas,exps,archivos,onClose,role,onAddExp,onEditExp,onDeleteExp,onUpload,onEditPaciente}) {
  const [tab,setTab] = useState("resumen");
  const [expO,setExpO] = useState(null);
  const pc=citas.filter(c=>c.pacienteId===p.id), ps=segs.filter(s=>s.pacienteId===p.id), pv=ventas.filter(v=>v.pacienteId===p.id);
  const pe=exps.filter(e=>e.pacienteId===p.id).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")), pa=archivos.filter(a=>a.pacienteId===p.id);
  const tabs=[{key:"resumen",label:"Resumen",ok:true},{key:"citas",label:"Citas ("+pc.length+")",ok:true},{key:"ventas",label:"Ventas ("+pv.length+")",ok:can(role,"ventas")},{key:"seguimientos",label:"Seguimientos ("+ps.length+")",ok:can(role,"seguimientos")},{key:"expediente",label:"Expediente ("+pe.length+")",ok:can(role,"expediente")},{key:"archivos",label:"Archivos ("+pa.length+")",ok:can(role,"archivos")}].filter(t=>t.ok);
  return <>
    <div className="do-overlay" onClick={onClose}/>
    <div className="do-ficha">
      {/* Barra de regreso móvil */}
      <div className="mob-back-bar">
        <button className="mob-back-btn" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Volver
        </button>
      </div>
      <div className="ficha-hd">
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div className="do-av do-av-teal" style={{width:52,height:52,fontSize:18}}>{ini(p.nombre)}</div>
          <div><div className="ficha-name">{p.nombre}</div><div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}><Tag type={p.tipo}/><span style={{fontSize:12,color:"#C4B5A0"}}>ID: {p.id}</span></div></div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
          <WA phone={p.telefono} msg={"Hola "+(p.nombre||"").split(" ")[0]+", le escribimos de Diane Opticas."}/>
          <a href={"tel:+52"+p.telefono.replace(/\D/g,"")} className="do-btn do-btn-out" style={{fontSize:12}}>{IC.ph} Llamar</a>
          {can(role,"pacientes")&&<button className="do-btn do-btn-out" style={{fontSize:12}} onClick={()=>onEditPaciente(p)}>{IC.pen} Editar</button>}
          <button className="do-close" onClick={onClose}>{IC.x}</button>
        </div>
      </div>
      <div className="ficha-tabs">{tabs.map(t=><button key={t.key} className={"ficha-tab"+(tab===t.key?" active":"")} onClick={()=>setTab(t.key)}>{t.label}</button>)}</div>
      <div className="ficha-body">
        {tab==="resumen"&&<div className="ficha-grid"><div>
          <div className="do-dsec"><div className="do-dsec-t">Contacto</div>
            <div className="do-df"><span className="do-df-l">Telefono</span><span className="do-df-v">{p.telefono}</span></div>
            <div className="do-df"><span className="do-df-l">Email</span><span className="do-df-v">{p.email||"—"}</span></div>
            <div className="do-df"><span className="do-df-l">Nacimiento</span><span className="do-df-v">{fmtD(p.fechaNac)}</span></div>
            <div className="do-df"><span className="do-df-l">Fuente</span><span className="do-df-v">{p.fuente}</span></div>
          </div>
          <div className="do-dsec"><div className="do-dsec-t">Actividad</div>
            <div className="do-df"><span className="do-df-l">Ultima visita</span><span className="do-df-v">{fmtD(p.ultimaVisita)}</span></div>
            <div className="do-df"><span className="do-df-l">Proxima cita</span><span className="do-df-v" style={{color:p.proximaCita?"#2A7C6F":"#D4726A"}}>{p.proximaCita?fmtD(p.proximaCita):"Sin agendar"}</span></div>
            <div className="do-df"><span className="do-df-l">Total compras</span><span className="do-df-v">{"$"+pv.reduce((s,v)=>s+(parseFloat(v.monto)||0),0).toLocaleString()+" MXN"}</span></div>
            <div className="do-df"><span className="do-df-l">Expedientes</span><span className="do-df-v">{pe.length+" consultas"}</span></div>
          </div>
        </div><div>
          <div className="do-dsec"><div className="do-dsec-t">Notas</div><div className="do-notes">{p.notas||"Sin notas."}</div></div>
          {pe.length>0&&<div className="do-dsec"><div className="do-dsec-t">{"Ultima Rx ("+fmtD(pe[0].fecha)+")"}</div>
            <div className="rx-grid rx-compact">
              <div className="rx-header"> </div><div className="rx-header">Esf</div><div className="rx-header">Cil</div><div className="rx-header">Eje</div><div className="rx-header">AV</div><div className="rx-header">Add</div>
              <div className="rx-eye">OD</div><RxCell val={pe[0].rxOD.esf}/><RxCell val={pe[0].rxOD.cil}/><RxCell val={pe[0].rxOD.eje}/><RxCell val={pe[0].rxOD.av}/><RxCell val={pe[0].addOD}/>
              <div className="rx-eye">OI</div><RxCell val={pe[0].rxOI.esf}/><RxCell val={pe[0].rxOI.cil}/><RxCell val={pe[0].rxOI.eje}/><RxCell val={pe[0].rxOI.av}/><RxCell val={pe[0].addOI}/>
            </div>
          </div>}
        </div></div>}
        {tab==="citas"&&<div>{pc.length>0?pc.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).map(c=><div key={c.id} className="list-row"><div><div style={{fontWeight:500,fontSize:14}}>{c.tipo}</div><div style={{fontSize:12,color:"#C4B5A0"}}>{fmtD(c.fecha)} - {c.hora}</div><div style={{fontSize:12,color:"#8B7355",marginTop:2}}>{c.notas}</div></div><Tag type={c.estado}/></div>):<div className="do-empty"><h4>Sin citas</h4></div>}</div>}
        {tab==="ventas"&&<div>{pv.length>0?pv.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).map(v=><div key={v.id} className="list-row"><div><div style={{fontWeight:500,fontSize:14}}>{v.concepto}</div><div style={{fontSize:12,color:"#C4B5A0"}}>{fmtD(v.fecha)} - {v.metodo}</div></div><div style={{textAlign:"right"}}><div style={{fontWeight:600,fontSize:15,color:"#2D2520"}}>{"$"+(v.monto||0).toLocaleString()}</div><Tag type={v.estado}/></div></div>):<div className="do-empty"><h4>Sin ventas</h4></div>}</div>}
        {tab==="seguimientos"&&<div>{ps.length>0?ps.map(s=><div key={s.id} className="list-row"><div><div style={{display:"flex",gap:8,alignItems:"center"}}><Tag type={s.tipo}/><span style={{fontWeight:500,fontSize:13}}>{fmtD(s.fechaSeg)}</span></div><div style={{fontSize:13,color:"#4A3F35",marginTop:6}}>{s.mensaje}</div></div><Tag type={s.estado}/></div>):<div className="do-empty"><h4>Sin seguimientos</h4></div>}</div>}
        {tab==="expediente"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:12,color:"#8B7355"}}>{pe.length} consultas</div>
            <button className="do-btn do-btn-pri" style={{fontSize:12}} onClick={()=>onAddExp(p.id)}>{IC.plus} Nueva Consulta</button>
          </div>
          {pe.length>0?pe.map(ex=><ExpedienteCard key={ex.id} ex={ex} archivos={archivos} expanded={expO===ex.id} onToggle={()=>setExpO(expO===ex.id?null:ex.id)} onEdit={onEditExp} onDelete={onDeleteExp} role={role} paciente={p}/>):<div className="do-empty"><h4>Sin expedientes</h4><p>Registra la primera consulta</p></div>}
        </div>}
        {tab==="archivos"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:12,color:"#8B7355"}}>{pa.length} archivos</div>
            <button className="do-btn do-btn-pri" style={{fontSize:12}} onClick={()=>onUpload(p.id)}>{IC.up} Subir</button>
          </div>
          {pa.length>0?pa.map(a=><div key={a.id} className="arc-row"><div className="arc-icon">{a.tipo==="Imagen"?"🖼":"📄"}</div><div className="arc-info"><div className="arc-name">{a.nombre}</div><div className="arc-meta">{a.categoria} - {a.tamano} - {fmtD(a.fecha)}</div></div><a href={a.url} target="_blank" rel="noopener noreferrer" className="do-btn do-btn-out" style={{fontSize:11,padding:"4px 10px"}}>{IC.dl} Abrir</a></div>):<div className="do-empty"><h4>Sin archivos</h4></div>}
        </div>}
      </div>
    </div>
  </>;
}

// ── ExpModal (nuevo y editar) ────────────────────────────────────────────────
function ExpModal({onClose,onSave,pacienteId,pacs,initial}) {
  const blank = {esf:"",cil:"",eje:"",av:""};
  const [f,sf] = useState(initial ? {
    pacienteId: initial.pacienteId||pacienteId||"",
    fecha: initial.fecha||today(),
    optometrista: initial.optometrista||"Lic. Opt. Diane",
    motivo: initial.motivo||"",
    rxOD: {...(initial.rxOD||blank)},
    rxOI: {...(initial.rxOI||blank)},
    addOD: initial.addOD||"", addOI: initial.addOI||"",
    dnp: initial.dnp||"", pioOD: initial.pioOD||"", pioOI: initial.pioOI||"",
    biomicroscopia: initial.biomicroscopia||"", fondoOjo: initial.fondoOjo||"",
    diagnostico: initial.diagnostico||"", recomendaciones: initial.recomendaciones||"",
    proximaRevision: initial.proximaRevision||"", tipoLente: initial.tipoLente||"", obsReceta: initial.obsReceta||"",
    avscOD: initial.avscOD||"", phOD: initial.phOD||"", avccOD: initial.avccOD||"",
    avscOI: initial.avscOI||"", phOI: initial.phOI||"", avccOI: initial.avccOI||"",
    archivosIds: initial.archivosIds||[]
  } : {
    pacienteId: pacienteId||"", fecha: today(), optometrista:"Lic. Opt. Diane",
    motivo:"", rxOD:{...blank}, rxOI:{...blank},
    addOD:"",addOI:"",dnp:"",pioOD:"",pioOI:"",
    avscOD:"",phOD:"",avccOD:"",avscOI:"",phOI:"",avccOI:"",
    biomicroscopia:"",fondoOjo:"",diagnostico:"",recomendaciones:"",proximaRevision:"",tipoLente:"",obsReceta:"",archivosIds:[]
  });
  const upRx = (eye,field,val) => sf({...f,[eye]:{...f[eye],[field]:val}});
  const isEdit = !!initial;
  return <Modal title={isEdit?"Editar Expediente":"Nueva Consulta"} onClose={onClose} wide footer={
    <><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button>
    <button className="do-btn do-btn-pri" onClick={()=>{if(!f.pacienteId||!f.motivo)return;onSave(f);onClose();}}>
      {isEdit?"Actualizar":"Guardar"}
    </button></>
  }>
    {!pacienteId&&<div className="do-fg"><label className="do-fl">Paciente *</label><select className="do-fi" value={f.pacienteId} onChange={ev=>sf({...f,pacienteId:ev.target.value})}><option value="">Seleccionar...</option>{pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>}
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Fecha</label><input className="do-fi" type="date" value={f.fecha} onChange={ev=>sf({...f,fecha:ev.target.value})}/></div><div className="do-fg"><label className="do-fl">Optometrista</label><input className="do-fi" value={f.optometrista} onChange={ev=>sf({...f,optometrista:ev.target.value})}/></div></div>
    <div className="do-fg"><label className="do-fl">Motivo *</label><input className="do-fi" value={f.motivo} onChange={ev=>sf({...f,motivo:ev.target.value})} placeholder="Revision anual, dolor de cabeza..."/></div>
    <div className="exp-form-section">Agudeza Visual</div>
    <div style={{overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:8}}>
        <thead><tr>
          <th style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:600,color:"#8B7355",fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:"center",border:"1px solid #E8DFD1"}}></th>
          <th style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:600,color:"#8B7355",fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:"center",border:"1px solid #E8DFD1"}}>AVSC</th>
          <th style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:600,color:"#8B7355",fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:"center",border:"1px solid #E8DFD1"}}>PH</th>
          <th style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:600,color:"#8B7355",fontSize:10,textTransform:"uppercase",letterSpacing:1,textAlign:"center",border:"1px solid #E8DFD1"}}>AVCC</th>
        </tr></thead>
        <tbody>
          <tr>
            <td style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:700,color:"#2A7C6F",textAlign:"center",border:"1px solid #E8DFD1",fontSize:12}}>OD</td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.avscOD||""} onChange={ev=>sf({...f,avscOD:ev.target.value})}/></td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.phOD||""} onChange={ev=>sf({...f,phOD:ev.target.value})}/></td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.avccOD||""} onChange={ev=>sf({...f,avccOD:ev.target.value})}/></td>
          </tr>
          <tr>
            <td style={{background:"#FAF7F2",padding:"6px 8px",fontWeight:700,color:"#2A7C6F",textAlign:"center",border:"1px solid #E8DFD1",fontSize:12}}>OI</td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.avscOI||""} onChange={ev=>sf({...f,avscOI:ev.target.value})}/></td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.phOI||""} onChange={ev=>sf({...f,phOI:ev.target.value})}/></td>
            <td style={{border:"1px solid #E8DFD1",padding:4}}><input className="do-fi" style={{textAlign:"center",padding:"6px 4px",fontSize:13}} placeholder="20/20" value={f.avccOI||""} onChange={ev=>sf({...f,avccOI:ev.target.value})}/></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div className="exp-form-section">Refraccion</div>
    <div className="rx-form">
      <div className="rx-form-row"><span className="rx-form-label">OD</span><input className="do-fi rx-fi" placeholder="Esf" value={f.rxOD.esf} onChange={ev=>upRx("rxOD","esf",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Cil" value={f.rxOD.cil} onChange={ev=>upRx("rxOD","cil",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Eje" value={f.rxOD.eje} onChange={ev=>upRx("rxOD","eje",ev.target.value)}/><input className="do-fi rx-fi" placeholder="AV" value={f.rxOD.av} onChange={ev=>upRx("rxOD","av",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Add" value={f.addOD} onChange={ev=>sf({...f,addOD:ev.target.value})}/></div>
      <div className="rx-form-row"><span className="rx-form-label">OI</span><input className="do-fi rx-fi" placeholder="Esf" value={f.rxOI.esf} onChange={ev=>upRx("rxOI","esf",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Cil" value={f.rxOI.cil} onChange={ev=>upRx("rxOI","cil",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Eje" value={f.rxOI.eje} onChange={ev=>upRx("rxOI","eje",ev.target.value)}/><input className="do-fi rx-fi" placeholder="AV" value={f.rxOI.av} onChange={ev=>upRx("rxOI","av",ev.target.value)}/><input className="do-fi rx-fi" placeholder="Add" value={f.addOI} onChange={ev=>sf({...f,addOI:ev.target.value})}/></div>
    </div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">DNP</label><input className="do-fi" value={f.dnp} onChange={ev=>sf({...f,dnp:ev.target.value})} placeholder="32/31"/></div><div className="do-fr"><div className="do-fg"><label className="do-fl">PIO OD</label><input className="do-fi" value={f.pioOD} onChange={ev=>sf({...f,pioOD:ev.target.value})} placeholder="mmHg"/></div><div className="do-fg"><label className="do-fl">PIO OI</label><input className="do-fi" value={f.pioOI} onChange={ev=>sf({...f,pioOI:ev.target.value})} placeholder="mmHg"/></div></div></div>
    <div className="exp-form-section">Hallazgos</div>
    <div className="do-fg"><label className="do-fl">Biomicroscopia</label><textarea className="do-fi do-ta" value={f.biomicroscopia} onChange={ev=>sf({...f,biomicroscopia:ev.target.value})}/></div>
    <div className="do-fg"><label className="do-fl">Fondo de ojo</label><textarea className="do-fi do-ta" value={f.fondoOjo} onChange={ev=>sf({...f,fondoOjo:ev.target.value})}/></div>
    <div className="exp-form-section">Diagnostico y Plan</div>
    <div className="do-fg"><label className="do-fl">Diagnostico</label><textarea className="do-fi do-ta" value={f.diagnostico} onChange={ev=>sf({...f,diagnostico:ev.target.value})}/></div>
    <div className="do-fg"><label className="do-fl">Recomendaciones</label><textarea className="do-fi do-ta" value={f.recomendaciones} onChange={ev=>sf({...f,recomendaciones:ev.target.value})}/></div>
    <div className="do-fg"><label className="do-fl">Proxima revision</label><input className="do-fi" type="date" value={f.proximaRevision} onChange={ev=>sf({...f,proximaRevision:ev.target.value})}/></div>
    <div className="exp-form-section">Receta para el paciente</div>
    <div className="do-fg"><label className="do-fl">Tipo de lente recomendado</label>
      <select className="do-fi" value={f.tipoLente||""} onChange={ev=>sf({...f,tipoLente:ev.target.value})}>
        <option value="">— Sin especificar —</option>
        <option>Monofocal</option>
        <option>Bifocal</option>
        <option>Progresivo</option>
        <option>Lentes de contacto</option>
        <option>Lentes de contacto multifocal</option>
        <option>Solo armazón (sin graduación)</option>
        <option>No requiere corrección</option>
      </select>
    </div>
    <div className="do-fg"><label className="do-fl">Observaciones para el paciente</label>
      <textarea className="do-fi do-ta" value={f.obsReceta||""} onChange={ev=>sf({...f,obsReceta:ev.target.value})} placeholder="Ej: Use sus lentes en todo momento. Revisión en 12 meses."/>
    </div>
  </Modal>;
}

// ── Paciente form ────────────────────────────────────────────────────────────
function PacienteModal({initial,pacs,onClose,onSave}) {
  const isEdit = !!initial;
  const [f,sf] = useState(initial ? {...initial} : {nombre:"",telefono:"",email:"",fechaNac:"",tipo:"Nuevo",fuente:"WhatsApp",notas:"",ultimaVisita:today(),proximaCita:""});
  return <Modal title={isEdit?"Editar Paciente":"Nuevo Paciente"} onClose={onClose} footer={
    <><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button>
    <button className="do-btn do-btn-pri" onClick={()=>{if(f.nombre&&f.telefono){onSave(f);onClose();}}}>{isEdit?"Actualizar":"Registrar"}</button></>
  }>
    <div className="do-fg"><label className="do-fl">Nombre *</label><input className="do-fi" value={f.nombre} onChange={ev=>sf({...f,nombre:ev.target.value})} placeholder="Nombre completo"/></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Telefono *</label><input className="do-fi" value={f.telefono} onChange={ev=>sf({...f,telefono:ev.target.value})} placeholder="443 123 4567"/></div><div className="do-fg"><label className="do-fl">Email</label><input className="do-fi" value={f.email} onChange={ev=>sf({...f,email:ev.target.value})}/></div></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Nacimiento</label><input className="do-fi" type="date" value={f.fechaNac} onChange={ev=>sf({...f,fechaNac:ev.target.value})}/></div><div className="do-fg"><label className="do-fl">Tipo</label><select className="do-fi" value={f.tipo} onChange={ev=>sf({...f,tipo:ev.target.value})}><option>Nuevo</option><option>Recurrente</option><option>Convenio</option></select></div></div>
    <div className="do-fg"><label className="do-fl">Fuente</label><select className="do-fi" value={f.fuente} onChange={ev=>sf({...f,fuente:ev.target.value})}><option>WhatsApp</option><option>Instagram</option><option>Facebook</option><option>Recomendacion</option><option>Caminata</option><option>Convenio Empresarial</option><option>Google</option><option>Otro</option></select></div>
    <div className="do-fg"><label className="do-fl">Proxima Cita</label><input className="do-fi" type="date" value={f.proximaCita} onChange={ev=>sf({...f,proximaCita:ev.target.value})}/></div>
    <div className="do-fg"><label className="do-fl">Notas</label><textarea className="do-fi do-ta" value={f.notas} onChange={ev=>sf({...f,notas:ev.target.value})}/></div>
  </Modal>;
}

// ── Cita form ────────────────────────────────────────────────────────────────
function CitaModal({initial,pacs,onClose,onSave}) {
  const isEdit = !!initial;
  const [f,sf] = useState(initial ? {...initial} : {pacienteId:"",fecha:"",hora:"",tipo:"Consulta",estado:"Por confirmar",notas:""});
  return <Modal title={isEdit?"Editar Cita":"Nueva Cita"} onClose={onClose} footer={
    <><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button>
    <button className="do-btn do-btn-pri" onClick={()=>{if(!f.pacienteId||!f.fecha||!f.hora)return;const p=pacs.find(x=>x.id===f.pacienteId);onSave({...f,paciente:p?p.nombre:""});onClose();}}>{isEdit?"Actualizar":"Agendar"}</button></>
  }>
    <div className="do-fg"><label className="do-fl">Paciente *</label><select className="do-fi" value={f.pacienteId} onChange={ev=>sf({...f,pacienteId:ev.target.value})}><option value="">Seleccionar...</option>{pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Fecha *</label><input className="do-fi" type="date" value={f.fecha} onChange={ev=>sf({...f,fecha:ev.target.value})}/></div><div className="do-fg"><label className="do-fl">Hora *</label><input className="do-fi" type="time" value={f.hora} onChange={ev=>sf({...f,hora:ev.target.value})}/></div></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Tipo</label><select className="do-fi" value={f.tipo} onChange={ev=>sf({...f,tipo:ev.target.value})}><option>Consulta</option><option>Entrega</option><option>Ajuste</option><option>Control</option><option>Lentes de contacto</option></select></div><div className="do-fg"><label className="do-fl">Estado</label><select className="do-fi" value={f.estado} onChange={ev=>sf({...f,estado:ev.target.value})}><option>Por confirmar</option><option>Confirmada</option><option>Pendiente</option><option>Cancelada</option></select></div></div>
    <div className="do-fg"><label className="do-fl">Notas</label><textarea className="do-fi do-ta" value={f.notas} onChange={ev=>sf({...f,notas:ev.target.value})}/></div>
  </Modal>;
}

// ── Seguimiento form ─────────────────────────────────────────────────────────
function SegModal({initial,pacs,onClose,onSave}) {
  const isEdit = !!initial;
  const [f,sf] = useState(initial ? {...initial} : {pacienteId:"",tipo:"Comercial",fechaSeg:today(),estado:"Pendiente",mensaje:""});
  return <Modal title={isEdit?"Editar Seguimiento":"Nuevo Seguimiento"} onClose={onClose} footer={
    <><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button>
    <button className="do-btn do-btn-pri" onClick={()=>{if(!f.pacienteId)return;const p=pacs.find(x=>x.id===f.pacienteId);onSave({...f,paciente:p?p.nombre:""});onClose();}}>{isEdit?"Actualizar":"Guardar"}</button></>
  }>
    <div className="do-fg"><label className="do-fl">Paciente *</label><select className="do-fi" value={f.pacienteId} onChange={ev=>sf({...f,pacienteId:ev.target.value})}><option value="">Seleccionar...</option>{pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Tipo</label><select className="do-fi" value={f.tipo} onChange={ev=>sf({...f,tipo:ev.target.value})}><option>Comercial</option><option>Salud</option><option>Recordatorio</option><option>Postventa</option></select></div><div className="do-fg"><label className="do-fl">Fecha</label><input className="do-fi" type="date" value={f.fechaSeg} onChange={ev=>sf({...f,fechaSeg:ev.target.value})}/></div></div>
    <div className="do-fg"><label className="do-fl">Estado</label><select className="do-fi" value={f.estado} onChange={ev=>sf({...f,estado:ev.target.value})}><option>Pendiente</option><option>Programado</option><option>Completado</option></select></div>
    <div className="do-fg"><label className="do-fl">Mensaje / Accion</label><textarea className="do-fi do-ta" value={f.mensaje} onChange={ev=>sf({...f,mensaje:ev.target.value})}/></div>
  </Modal>;
}

// ── Venta form ───────────────────────────────────────────────────────────────
function VentaModal({initial,pacs,onClose,onSave}) {
  const isEdit = !!initial;
  const [f,sf] = useState(initial ? {...initial, monto: String(initial.monto||"")} : {pacienteId:"",fecha:today(),concepto:"",monto:"",estado:"Pagada",metodo:"Efectivo",notas:""});
  return <Modal title={isEdit?"Editar Venta":"Nueva Venta"} onClose={onClose} footer={
    <><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button>
    <button className="do-btn do-btn-pri" style={{background:"#C49A3C"}} onClick={()=>{if(!f.pacienteId||!f.concepto)return;const p=pacs.find(x=>x.id===f.pacienteId);onSave({...f,monto:parseFloat(f.monto)||0,paciente:p?p.nombre:""});onClose();}}>{isEdit?"Actualizar":"Registrar venta"}</button></>
  }>
    <div className="do-fg"><label className="do-fl">Paciente *</label><select className="do-fi" value={f.pacienteId} onChange={ev=>sf({...f,pacienteId:ev.target.value})}><option value="">Seleccionar...</option>{pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
    <div className="do-fg"><label className="do-fl">Concepto / Productos *</label><input className="do-fi" value={f.concepto} onChange={ev=>sf({...f,concepto:ev.target.value})} placeholder="Armazon + Lentes progresivos Varilux..."/></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Monto ($)</label><input className="do-fi" type="number" value={f.monto} onChange={ev=>sf({...f,monto:ev.target.value})} placeholder="0.00"/></div><div className="do-fg"><label className="do-fl">Fecha</label><input className="do-fi" type="date" value={f.fecha} onChange={ev=>sf({...f,fecha:ev.target.value})}/></div></div>
    <div className="do-fr"><div className="do-fg"><label className="do-fl">Estado</label><select className="do-fi" value={f.estado} onChange={ev=>sf({...f,estado:ev.target.value})}><option>Pagada</option><option>Pendiente</option><option>Apartado</option><option>Cancelada</option></select></div><div className="do-fg"><label className="do-fl">Metodo de Pago</label><select className="do-fi" value={f.metodo} onChange={ev=>sf({...f,metodo:ev.target.value})}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>Convenio BBVA</option><option>Convenio FEMSA</option><option>Otro</option></select></div></div>
    <div className="do-fg"><label className="do-fl">Notas</label><textarea className="do-fi do-ta" value={f.notas||""} onChange={ev=>sf({...f,notas:ev.target.value})}/></div>
  </Modal>;
}

// ── Upload modal ─────────────────────────────────────────────────────────────
function UploadModal({onClose,pacienteId,pacs,role,onUploaded}) {
  const [f,sf]=useState({pacienteId:pacienteId||"",expedienteId:"",categoria:"General"});
  const [file,setFile]=useState(null);
  const [preview,setPreview]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState("");
  const handleFile=(ev)=>{const sel=ev.target.files[0];if(!sel)return;if(sel.size>10*1024*1024){setError("Archivo muy grande (max 10MB)");return;}setFile(sel);setError("");if(sel.type.startsWith("image/")){const r=new FileReader();r.onload=e=>setPreview(e.target.result);r.readAsDataURL(sel);}else{setPreview(null);}};
  const handleUpload=async()=>{if(!file||!f.pacienteId){setError("Selecciona paciente y archivo");return;}setUploading(true);setError("");try{const reader=new FileReader();reader.onload=async(e)=>{const base64=e.target.result.split(",")[1];const archivoId=uid("A");const res=await fetch(API_URL,{method:"POST",body:JSON.stringify({action:"upload",archivoId,pacienteId:f.pacienteId,expedienteId:f.expedienteId,categoria:f.categoria,fileName:file.name,mimeType:file.type,fileData:base64,subidoPor:role})});const data=await res.json();if(data.success){onUploaded({id:archivoId,pacienteId:f.pacienteId,expedienteId:f.expedienteId,nombre:file.name,tipo:file.type.startsWith("image/")?"Imagen":"PDF",categoria:f.categoria,fecha:today(),url:data.fileUrl,tamano:data.tamano,subidoPor:role});}else{setError(data.error||"Error al subir");setUploading(false);}};reader.readAsDataURL(file);}catch(err){setError(err.toString());setUploading(false);}};
  return <Modal title="Subir Archivo" onClose={onClose} footer={<><button className="do-btn do-btn-out" onClick={onClose}>Cancelar</button><button className="do-btn do-btn-pri" onClick={handleUpload} disabled={uploading||!file}>{uploading?"Subiendo...":"Subir Archivo"}</button></>}>
    {!pacienteId&&<div className="do-fg"><label className="do-fl">Paciente *</label><select className="do-fi" value={f.pacienteId} onChange={ev=>sf({...f,pacienteId:ev.target.value})}><option value="">Seleccionar...</option>{pacs.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>}
    <div className="do-fg"><label className="do-fl">Categoria</label><select className="do-fi" value={f.categoria} onChange={ev=>sf({...f,categoria:ev.target.value})}><option>General</option><option>Retinografia</option><option>Paquimetria</option><option>Receta</option><option>Convenio</option><option>Foto clinica</option><option>Campimetria</option><option>OCT</option><option>Otro</option></select></div>
    <div className="do-fg"><label className="do-fl">Expediente (opcional)</label><input className="do-fi" value={f.expedienteId} onChange={ev=>sf({...f,expedienteId:ev.target.value})} placeholder="EX001 (dejar vacio si no aplica)"/></div>
    <div className="do-fg"><label className="do-fl">Archivo *</label><div style={{border:"2px dashed #E8DFD1",borderRadius:10,padding:24,textAlign:"center",cursor:"pointer",background:file?"#E8F5F2":"#FDFBF8"}} onClick={()=>document.getElementById("file-input").click()}><input id="file-input" type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={handleFile}/>{file?<div><div style={{fontSize:14,fontWeight:500}}>{file.name}</div><div style={{fontSize:12,color:"#8B7355",marginTop:4}}>{(file.size/1024).toFixed(0)} KB</div></div>:<div><div style={{fontSize:32,marginBottom:8}}>📎</div><div style={{fontSize:14,color:"#8B7355"}}>Clic para seleccionar foto o PDF</div><div style={{fontSize:12,color:"#C4B5A0",marginTop:4}}>Max 10 MB</div></div>}</div></div>
    {preview&&<div className="do-fg"><label className="do-fl">Vista previa</label><img src={preview} style={{maxWidth:"100%",maxHeight:200,borderRadius:8,border:"1px solid #E8DFD1"}} alt="preview"/></div>}
    {error&&<div style={{color:"#D4726A",fontSize:13,padding:"8px 12px",background:"#FDF0EE",borderRadius:8,marginTop:8}}>{error}</div>}
    {uploading&&<div style={{textAlign:"center",padding:16}}><div style={{width:24,height:24,border:"3px solid #E8DFD1",borderTopColor:"#2A7C6F",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/><div style={{fontSize:13,color:"#8B7355",marginTop:8}}>Subiendo...</div></div>}
  </Modal>;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function DianeOpticasCRM() {
  const [role,setRole]    = useState("admin");
  const [view,setView]    = useState("dashboard");
  const [search,setSearch]= useState("");
  const [selPat,setSelPat]= useState(null);
  const [mobNav,setMobNav]= useState(false);
  const [showGSearch,setShowGSearch] = useState(false);

  // modals
  const [showPacM,setShowPacM]   = useState(null); // null=closed, {}=new, {id...}=edit
  const [showCitaM,setShowCitaM] = useState(null);
  const [showExpM,setShowExpM]   = useState(null); // {pacienteId?, initial?}
  const [showVentaM,setShowVentaM]= useState(null);
  const [showSegM,setShowSegM]   = useState(null);
  const [showUpload,setShowUpload]= useState(null);
  const [confirm,setConfirm]     = useState(null); // {msg, onYes}

  // data
  const [pacs,setPacs]       = useState([]);
  const [citas,setCitas]     = useState([]);
  const [segs,setSegs]       = useState([]);
  const [ventas,setVentas]   = useState([]);
  const [exps,setExps]       = useState([]);
  const [archivos,setArchivos]= useState([]);
  const [loading,setLoading] = useState(true);
  const [dataSource,setDataSource] = useState("");

  // filters
  const [pF,setPF] = useState("Todos");
  const [cF,setCF] = useState("Todas");
  const [sF,setSF] = useState("Todos");
  const [vF,setVF] = useState("Todas");

  const {toasts, show: toast} = useToast();

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      async function safe(name, parser) {
        try { const r = await fetchSheet(name); return parser ? r.map(parser) : r; }
        catch(e) { console.warn("Error en "+name+":", e); return null; }
      }
      const p = await safe("Pacientes");
      const c = await safe("Citas");
      const s = await safe("Seguimientos");
      const v = await safe("Ventas");
      const e = await safe("Expedientes", parseExpediente);
      const a = await safe("Archivos");
      if (p && p.length > 0) {
        setPacs(p); setCitas(c||[]); setSegs(s||[]); setVentas(v||[]); setExps(e||[]); setArchivos(a||[]);
        setDataSource("Google Sheets ("+p.length+" pac)");
      } else {
        setPacs(D_PAC); setCitas(D_CIT); setSegs(D_SEG); setVentas(D_VEN); setExps(D_EXP); setArchivos(D_ARC);
        setDataSource("Demo");
      }
      setLoading(false);
    }
    loadData();
  }, []);

  // ── CRUD helpers ───────────────────────────────────────────
  // Pacientes
  const savePaciente = async (f) => {
    const isEdit = !!f.id;
    const row = isEdit ? f : {...f, id: uid("P")};
    if (isEdit) {
      setPacs(pacs.map(p=>p.id===row.id?row:p));
      toast("Paciente actualizado");
      updateInSheet("Pacientes", row.id, row);
    } else {
      setPacs([row,...pacs]);
      toast("Paciente registrado");
      writeToSheet("Pacientes", row);
    }
  };
  const deletePaciente = (id) => {
    setConfirm({msg:"¿Eliminar este paciente y todos sus datos?", onYes:()=>{
      setPacs(pacs.filter(p=>p.id!==id));
      setSelPat(null);
      toast("Paciente eliminado","info");
      deleteFromSheet("Pacientes", id);
    }});
  };

  // Citas
  const saveCita = async (f) => {
    const isEdit = !!f.id;
    const row = isEdit ? f : {...f, id: uid("C")};
    if (isEdit) { setCitas(citas.map(c=>c.id===row.id?row:c)); toast("Cita actualizada"); updateInSheet("Citas",row.id,row); }
    else { setCitas([row,...citas]); toast("Cita agendada"); writeToSheet("Citas",row); }
    // Auto-actualizar paciente si cita se marca Completada
    if(row.estado==="Completada"&&row.pacienteId) {
      const pac = pacs.find(p=>p.id===row.pacienteId);
      if(pac) {
        const updPac = {...pac, ultimaVisita: row.fecha};
        setPacs(pacs.map(p=>p.id===pac.id?updPac:p));
        if(selPat&&selPat.id===pac.id) setSelPat(updPac);
        updateInSheet("Pacientes", pac.id, updPac);
        toast("Última visita actualizada para "+pac.nombre);
      }
    }
    // Auto-poner proximaCita en paciente si es cita futura
    if(row.estado!=="Cancelada"&&row.pacienteId&&row.fecha>=today()) {
      const pac = pacs.find(p=>p.id===row.pacienteId);
      if(pac&&(!pac.proximaCita||row.fecha<pac.proximaCita)) {
        const updPac = {...pac, proximaCita: row.fecha};
        setPacs(pacs.map(p=>p.id===pac.id?updPac:p));
        if(selPat&&selPat.id===pac.id) setSelPat(updPac);
        updateInSheet("Pacientes", pac.id, updPac);
      }
    }
  };
  const deleteCita = (id) => {
    setConfirm({msg:"¿Eliminar esta cita?", onYes:()=>{
      setCitas(citas.filter(c=>c.id!==id)); toast("Cita eliminada","info"); deleteFromSheet("Citas",id);
    }});
  };

  // Seguimientos
  const saveSeg = async (f) => {
    const isEdit = !!f.id;
    const row = isEdit ? f : {...f, id: uid("S")};
    if (isEdit) { setSegs(segs.map(s=>s.id===row.id?row:s)); toast("Seguimiento actualizado"); updateInSheet("Seguimientos",row.id,row); }
    else { setSegs([row,...segs]); toast("Seguimiento registrado"); writeToSheet("Seguimientos",row); }
  };
  const deleteSeg = (id) => {
    setConfirm({msg:"¿Eliminar este seguimiento?", onYes:()=>{
      setSegs(segs.filter(s=>s.id!==id)); toast("Seguimiento eliminado","info"); deleteFromSheet("Seguimientos",id);
    }});
  };

  // Ventas
  const saveVenta = async (f) => {
    const isEdit = !!f.id;
    const row = isEdit ? f : {...f, id: uid("V")};
    if (isEdit) { setVentas(ventas.map(v=>v.id===row.id?row:v)); toast("Venta actualizada"); updateInSheet("Ventas",row.id,row); }
    else { setVentas([row,...ventas]); toast("Venta registrada"); writeToSheet("Ventas",row); }
  };
  const deleteVenta = (id) => {
    setConfirm({msg:"¿Eliminar este registro de venta?", onYes:()=>{
      setVentas(ventas.filter(v=>v.id!==id)); toast("Venta eliminada","info"); deleteFromSheet("Ventas",id);
    }});
  };

  // Expedientes — aplanar rxOD/rxOI para Sheets
  const flattenExp = (ex) => ({
    ...ex,
    rxOD_esf:ex.rxOD?.esf||"", rxOD_cil:ex.rxOD?.cil||"", rxOD_eje:ex.rxOD?.eje||"", rxOD_av:ex.rxOD?.av||"",
    rxOI_esf:ex.rxOI?.esf||"", rxOI_cil:ex.rxOI?.cil||"", rxOI_eje:ex.rxOI?.eje||"", rxOI_av:ex.rxOI?.av||"",
    tipoLente: ex.tipoLente||"", obsReceta: ex.obsReceta||"",
    avscOD: ex.avscOD||"", phOD: ex.phOD||"", avccOD: ex.avccOD||"",
    avscOI: ex.avscOI||"", phOI: ex.phOI||"", avccOI: ex.avccOI||"",
    archivosIds:(ex.archivosIds||[]).join(","),
  });
  const saveExp = async (f) => {
    const paciente = pacs.find(x=>x.id===f.pacienteId)||{};
    const isEdit = !!f.id;
    const row = isEdit ? {...f} : {...f, id: uid("EX"), paciente: paciente.nombre||""};
    if (isEdit) {
      setExps(exps.map(e=>e.id===row.id?row:e));
      toast("Expediente actualizado");
      updateInSheet("Expedientes", row.id, flattenExp(row));
    } else {
      setExps([row,...exps]);
      toast("Expediente guardado");
      writeToSheet("Expedientes", flattenExp(row));
    }
  };
  const deleteExp = (id) => {
    setConfirm({msg:"¿Eliminar este expediente clínico?", onYes:()=>{
      setExps(exps.filter(e=>e.id!==id)); toast("Expediente eliminado","info"); deleteFromSheet("Expedientes",id);
    }});
  };

  // ── Derived ────────────────────────────────────────────────
  const segPend    = segs.filter(s=>s.estado==="Pendiente").length;
  const citasSem   = citas.filter(c=>{const d=dUntil(c.fecha);return d>=0&&d<=7;}).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
  const citasHoy   = citas.filter(c=>c.fecha===today());
  const segsPend   = segs.filter(s=>s.estado==="Pendiente");
  const sinCita    = pacs.filter(p=>!p.proximaCita&&dUntil(p.ultimaVisita)<-90);
  const alerts     = [...segsPend.filter(s=>dUntil(s.fechaSeg)<=2).map(s=>({t:"urgent",title:"Seguimiento: "+s.paciente,sub:s.mensaje})),...sinCita.map(p=>({t:"reminder",title:p.nombre+" - "+Math.abs(dUntil(p.ultimaVisita))+"d sin visita",sub:"Ultima: "+fmtD(p.ultimaVisita)}))];
  const filtP      = pacs.filter(p=>(pF==="Todos"||p.tipo===pF)&&(!search||p.nombre.toLowerCase().includes(search.toLowerCase())||p.telefono.includes(search)));
  const filtC      = citas.filter(c=>cF==="Todas"||c.estado===cF).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));
  const filtS      = segs.filter(s=>sF==="Todos"||s.estado===sF).sort((a,b)=>(a.fechaSeg||"").localeCompare(b.fechaSeg||""));
  const filtV      = ventas.filter(v=>vF==="Todas"||v.metodo===vF).sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const ventasMes  = ventas.filter(v=>v.fecha&&v.fecha.startsWith(today().slice(0,7)));
  const totalMes   = ventasMes.reduce((s,v)=>s+(parseFloat(v.monto)||0),0);

  const navItems = [
    {key:"dashboard",icon:IC.dash,label:"Panel",perm:"dashboard"},
    {key:"pacientes",icon:IC.usr,label:"Pacientes",perm:"pacientes"},
    {key:"citas",icon:IC.cal,label:"Agenda",perm:"citas"},
    {key:"seguimientos",icon:IC.pul,label:"Seguimientos",perm:"seguimientos",badge:segPend},
    {key:"expedientes",icon:IC.eye,label:"Expedientes",perm:"expediente"},
    {key:"ventas",icon:IC.bag,label:"Ventas",perm:"ventas"},
    {key:"archivos",icon:IC.clip,label:"Archivos",perm:"archivos"},
  ].filter(n=>can(role,n.perm));

  const titles = {dashboard:"Panel Principal",pacientes:"Pacientes",citas:"Agenda",seguimientos:"Seguimientos",expedientes:"Expedientes",ventas:"Ventas",archivos:"Archivos"};

  if (loading) return <><style>{STYLES}</style><div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#FAF7F2",flexDirection:"column",gap:16}}><div style={{width:40,height:40,border:"3px solid #E8DFD1",borderTopColor:"#2A7C6F",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#2D2520"}}>Diane Opticas</div><div style={{fontSize:13,color:"#8B7355"}}>Cargando datos...</div><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style></div></>;

  return <>
    <style>{STYLES}</style>
    <div className="do-layout">
      {/* Sidebar */}
      {/* Overlay para cerrar sidebar en móvil */}
      {mobNav&&<div className="mob-sidebar-overlay" onClick={()=>setMobNav(false)}/>}
      <aside className={"do-side"+(mobNav?" open":"")}>
        <div className="do-side-brand"><h1>Diane Opticas</h1><p>CRM + Clinica</p></div>
        <nav className="do-side-nav">
          <div className="do-side-label">Modulos</div>
          {navItems.map(n=><button key={n.key} className={"do-nav"+(view===n.key?" active":"")} onClick={()=>{setView(n.key);setMobNav(false);}}>
            {n.icon}{n.label}{n.badge>0&&<span className="do-badge">{n.badge}</span>}
          </button>)}
        </nav>
        <div className="role-switch">
          <div className="do-side-label" style={{padding:"8px 0 6px"}}>Sesion</div>
          {Object.entries(ROLES).map(([k,v])=><button key={k} className={"role-btn"+(role===k?" active":"")} style={{borderLeftColor:role===k?v.color:"transparent"}} onClick={()=>{setRole(k);setView("dashboard")}}>{IC.lock}<span>{v.label}</span></button>)}
        </div>
        <div className="do-side-ft">Plaza Escala - Morelia<br/>v3.0 - {dataSource}</div>
      </aside>

      {/* Main */}
      <main className="do-main">
        <div className="do-top">
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button className="do-mob-tog" onClick={()=>setMobNav(!mobNav)}>{IC.menu}</button>
            <span className="do-top-title">{titles[view]}</span>
            <span className="role-badge" style={{background:ROLES[role].color}}>{ROLES[role].label}</span>
          </div>
          <div className="do-top-act">
            <div className="do-search" style={{position:"relative"}}>
              {IC.srch}
              <input placeholder="Buscar en el CRM..." value={search}
                onChange={ev=>{setSearch(ev.target.value);if(ev.target.value.length>1)setShowGSearch(true);else setShowGSearch(false);}}
                onFocus={()=>{if(search.length>1)setShowGSearch(true);}}
                onBlur={()=>setTimeout(()=>setShowGSearch(false),180)}
              />
              {showGSearch&&search.length>1&&<GlobalSearch q={search} pacs={pacs} citas={citas} ventas={ventas} exps={exps} onSelect={(type,item)=>{setShowGSearch(false);setSearch("");if(type==="pac"){setSelPat(item);}else if(type==="cita"){const p=pacs.find(x=>x.id===item.pacienteId);p&&setSelPat(p);setView("citas");}else if(type==="venta"){const p=pacs.find(x=>x.id===item.pacienteId);p&&setSelPat(p);setView("ventas");}else if(type==="exp"){const p=pacs.find(x=>x.id===item.pacienteId);p&&setSelPat(p);}}}/>}
            </div>
            {can(role,"citas")&&<button className="do-btn do-btn-out" onClick={()=>setShowCitaM({})}>{IC.cal} Cita</button>}
            {can(role,"expediente")&&<button className="do-btn do-btn-out" onClick={()=>setShowExpM({pacienteId:""})}>{IC.eye} Expediente</button>}
            {can(role,"ventas")&&<button className="do-btn do-btn-out" style={{borderColor:"#C49A3C",color:"#C49A3C"}} onClick={()=>setShowVentaM({})}>{IC.bag} Venta</button>}
            {can(role,"pacientes")&&<button className="do-btn do-btn-pri" onClick={()=>setShowPacM({})}>{IC.plus} Paciente</button>}
          </div>
        </div>

        <div className="do-page">
          {/* ── DASHBOARD ── */}
          {view==="dashboard"&&<div>
            <div className="do-stats">
              <div className="do-stat s1"><div className="do-stat-label">Pacientes</div><div className="do-stat-val">{pacs.length}</div><div className="do-stat-sub">Registro total</div></div>
              <div className="do-stat s2"><div className="do-stat-label">Citas Semana</div><div className="do-stat-val">{citasSem.length}</div><div className="do-stat-sub">{citasHoy.length} hoy</div></div>
              <div className="do-stat s3"><div className="do-stat-label">Seguimientos</div><div className="do-stat-val">{segsPend.length}</div><div className="do-stat-sub">Pendientes</div></div>
              <div className="do-stat s4"><div className="do-stat-label">Ventas mes</div><div className="do-stat-val">{"$"+totalMes.toLocaleString()}</div><div className="do-stat-sub">{ventasMes.length} transacciones</div></div>
            </div>
            {alerts.length>0&&<div style={{marginBottom:24}}><h3 className="sec-title">Atencion Requerida</h3>{alerts.map((a,i)=><div key={i} className={"do-alert "+a.t}><div className={"do-alert-ic "+(a.t==="urgent"?"u":"r")}>{IC.alrt}</div><div className="do-alert-c"><div className="do-alert-t">{a.title}</div><div className="do-alert-s">{a.sub}</div></div></div>)}</div>}
            <div className="do-tbl">
              <div className="do-tbl-hd"><h3>Proximas Citas</h3></div>
              {citasSem.length>0?<><table><thead><tr><th>Paciente</th><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>{citasSem.map((c,i)=>{const p=pacs.find(x=>x.id===c.pacienteId);return <tr key={c.id} onClick={()=>p&&setSelPat(p)}><td><div className="do-pcell"><Av name={c.paciente} i={i}/><span className="do-pname">{c.paciente}</span></div></td><td>{fmtD(c.fecha)}</td><td>{c.hora}</td><td>{c.tipo}</td><td><Tag type={c.estado}/></td><td>{p&&<WA phone={p.telefono} msg={"Recordatorio cita "+fmtD(c.fecha)+" "+c.hora}/>}</td></tr>;})}</tbody></table></>:<div className="do-empty"><h4>Sin citas esta semana</h4></div>}
            </div>
          </div>}

          {/* ── PACIENTES ── */}
          {view==="pacientes"&&<div className="do-tbl">
            <div className="do-tbl-hd"><h3>Pacientes ({filtP.length})</h3><div className="do-filters">{["Todos","Nuevo","Recurrente","Convenio"].map(f=><Chip key={f} label={f} active={pF===f} onClick={()=>setPF(f)}/>)}</div></div>
            <div className="mob-list">{filtP.map((p,i)=><div key={p.id} className="mob-card" onClick={()=>setSelPat(p)}>
              <Av name={p.nombre} i={i}/>
              <div className="mob-card-body">
                <div className="mob-card-name">{p.nombre}</div>
                <div className="mob-card-sub">{p.telefono} · {p.fuente||"—"}</div>
                <div className="mob-card-meta"><Tag type={p.tipo}/><span style={{fontSize:11,color:p.proximaCita?"#2A7C6F":"#D4726A"}}>{p.proximaCita?fmtD(p.proximaCita):"Sin cita"}</span></div>
              </div>
              <div className="mob-card-right">
                <WA phone={p.telefono} msg={"Hola "+(p.nombre||"").split(" ")[0]+", le escribimos de Diane Opticas."}/>
              </div>
            </div>)}</div>
            <table><thead><tr><th>Paciente</th><th>Telefono</th><th>Tipo</th><th>Ultima</th><th>Proxima</th><th>Fuente</th><th></th></tr></thead>
            <tbody>{filtP.map((p,i)=><tr key={p.id} onClick={()=>setSelPat(p)}>
              <td><div className="do-pcell"><Av name={p.nombre} i={i}/><div><div className="do-pname">{p.nombre}</div><div className="do-pdetail">{p.email||"Sin email"}</div></div></div></td>
              <td>{p.telefono}</td><td><Tag type={p.tipo}/></td><td>{fmtD(p.ultimaVisita)}</td>
              <td style={{color:p.proximaCita?"#2A7C6F":"#D4726A"}}>{p.proximaCita?fmtD(p.proximaCita):"Sin agendar"}</td>
              <td style={{fontSize:12,color:"#C4B5A0"}}>{p.fuente}</td>
              <td onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:6,alignItems:"center"}}>
                <WA phone={p.telefono} msg={"Hola "+(p.nombre||"").split(" ")[0]+", le escribimos de Diane Opticas."}/>
                {can(role,"pacientes")&&<button className="do-btn-ic" onClick={e=>{e.stopPropagation();setShowPacM(p)}}>{IC.pen}</button>}
                {can(role,"pacientes")&&<button className="do-btn-ic do-btn-ic-d" onClick={e=>{e.stopPropagation();deletePaciente(p.id)}}>{IC.trash}</button>}
              </div></td>
            </tr>)}</tbody></table>
            {filtP.length===0&&<div className="do-empty"><h4>Sin resultados</h4></div>}
          </div>}

          {/* ── CITAS ── */}
          {view==="citas"&&<div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button className="do-btn do-btn-pri" onClick={()=>setShowCitaM({})}>{IC.plus} Nueva Cita</button>
            </div>
            <div className="do-tbl">
              <div className="do-tbl-hd"><h3>Agenda ({filtC.length})</h3><div className="do-filters">{["Todas","Confirmada","Pendiente","Por confirmar"].map(f=><Chip key={f} label={f} active={cF===f} onClick={()=>setCF(f)}/>)}</div></div>
              <div className="mob-list">{filtC.map((c,i)=>{const p=pacs.find(x=>x.id===c.pacienteId);return <div key={c.id} className="mob-card" style={{opacity:dUntil(c.fecha)<0?.5:1}} onClick={()=>p&&setSelPat(p)}>
                <Av name={c.paciente} i={i}/>
                <div className="mob-card-body">
                  <div className="mob-card-name">{c.paciente}</div>
                  <div className="mob-card-sub">{fmtD(c.fecha)} · {c.hora} · {c.tipo}</div>
                  <div className="mob-card-meta"><Tag type={c.estado}/></div>
                  <div className="mob-card-actions">
                    {p&&<WA phone={p.telefono} msg={"Recordatorio cita "+fmtD(c.fecha)}/>}
                    {can(role,"citas")&&<button className="do-btn-ic" onClick={e=>{e.stopPropagation();setShowCitaM(c)}}>{IC.pen}</button>}
                    {can(role,"citas")&&<button className="do-btn-ic do-btn-ic-d" onClick={e=>{e.stopPropagation();deleteCita(c.id)}}>{IC.trash}</button>}
                  </div>
                </div>
              </div>;})}
              </div>
              <table><thead><tr><th>Paciente</th><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estado</th><th>Notas</th><th></th></tr></thead>
              <tbody>{filtC.map((c,i)=>{const p=pacs.find(x=>x.id===c.pacienteId);return <tr key={c.id} style={{opacity:dUntil(c.fecha)<0?.5:1}} onClick={()=>p&&setSelPat(p)}>
                <td><div className="do-pcell"><Av name={c.paciente} i={i}/><span className="do-pname">{c.paciente}</span></div></td>
                <td>{fmtD(c.fecha)}</td><td>{c.hora}</td><td>{c.tipo}</td><td><Tag type={c.estado}/></td>
                <td style={{fontSize:12,color:"#C4B5A0",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notas}</td>
                <td onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:6}}>
                  {p&&<WA phone={p.telefono} msg={"Recordatorio cita "+fmtD(c.fecha)}/>}
                  {can(role,"citas")&&<button className="do-btn-ic" onClick={()=>setShowCitaM(c)}>{IC.pen}</button>}
                  {can(role,"citas")&&<button className="do-btn-ic do-btn-ic-d" onClick={()=>deleteCita(c.id)}>{IC.trash}</button>}
                </div></td>
              </tr>;})}
              </tbody></table>
            </div>
          </div>}

          {/* ── SEGUIMIENTOS ── */}
          {view==="seguimientos"&&<div>
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
              <button className="do-btn do-btn-pri" onClick={()=>setShowSegM({})}>{IC.plus} Nuevo Seguimiento</button>
            </div>
            <div className="do-tbl">
              <div className="do-tbl-hd"><h3>Seguimientos ({filtS.length})</h3><div className="do-filters">{["Todos","Pendiente","Programado"].map(f=><Chip key={f} label={f} active={sF===f} onClick={()=>setSF(f)}/>)}</div></div>
              <table><thead><tr><th>Paciente</th><th>Tipo</th><th>Mensaje</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
              <tbody>{filtS.map((s,i)=>{const p=pacs.find(x=>x.id===s.pacienteId);const urg=s.estado==="Pendiente"&&dUntil(s.fechaSeg)<=3;return <tr key={s.id} style={{background:urg?"#FDF0EE":undefined}}>
                <td><div className="do-pcell"><Av name={s.paciente} i={i}/><span className="do-pname">{s.paciente}</span></div></td>
                <td><Tag type={s.tipo}/></td>
                <td style={{fontSize:12.5,maxWidth:240}}>{s.mensaje}</td>
                <td style={{color:urg?"#D4726A":undefined,fontWeight:urg?600:400}}>{fmtD(s.fechaSeg)}{urg&&<span style={{fontSize:10,display:"block",color:"#D4726A"}}>Urgente</span>}</td>
                <td><Tag type={s.estado}/></td>
                <td><div style={{display:"flex",gap:6}}>
                  {p&&<WA phone={p.telefono} msg={s.mensaje}/>}
                  {can(role,"seguimientos")&&<button className="do-btn-ic" onClick={()=>setShowSegM(s)}>{IC.pen}</button>}
                  {can(role,"seguimientos")&&<button className="do-btn-ic do-btn-ic-d" onClick={()=>deleteSeg(s.id)}>{IC.trash}</button>}
                </div></td>
              </tr>;})}
              </tbody></table>
            </div>
          </div>}

          {/* ── EXPEDIENTES ── */}
          {view==="expedientes"&&<div className="do-tbl">
            <div className="do-tbl-hd"><h3>Expedientes ({exps.length})</h3><button className="do-btn do-btn-pri" style={{fontSize:12}} onClick={()=>setShowExpM({pacienteId:""})}>{IC.plus} Nueva Consulta</button></div>
            <table><thead><tr><th>Paciente</th><th>Fecha</th><th>Motivo</th><th>Diagnostico</th><th>Prox.</th><th></th></tr></thead>
            <tbody>{exps.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).map((ex,i)=>{const p=pacs.find(x=>x.id===ex.pacienteId);const isA=ex.diagnostico&&ex.diagnostico.includes("SOSPECHA");return <tr key={ex.id} onClick={()=>p&&setSelPat(p)}>
              <td><div className="do-pcell"><Av name={p?p.nombre:"?"} i={i}/><span className="do-pname">{p?p.nombre:"?"}</span></div></td>
              <td>{fmtD(ex.fecha)}</td>
              <td style={{fontSize:13}}>{ex.motivo}</td>
              <td style={{fontSize:12,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{isA?<span style={{color:"#D4726A",fontWeight:600}}>{"!! "+ex.diagnostico.slice(0,40)}</span>:(ex.diagnostico||"").slice(0,40)}</td>
              <td>{fmtD(ex.proximaRevision)}</td>
              <td onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:6}}>
                <button className="do-btn do-btn-out" style={{fontSize:11,padding:"4px 10px"}} onClick={()=>p&&setSelPat(p)}>Ficha</button>
                {can(role,"expediente")&&<button className="do-btn-ic" onClick={()=>setShowExpM({initial:ex,pacienteId:ex.pacienteId})}>{IC.pen}</button>}
                {can(role,"expediente")&&<button className="do-btn-ic do-btn-ic-d" onClick={()=>deleteExp(ex.id)}>{IC.trash}</button>}
              </div></td>
            </tr>;})}
            </tbody></table>
          </div>}

          {/* ── VENTAS ── */}
          {view==="ventas"&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{background:"#fff",border:"1px solid rgba(232,223,209,.6)",borderRadius:10,padding:"12px 20px",display:"flex",gap:24}}>
                <div><div style={{fontSize:11,color:"#8B7355",textTransform:"uppercase",letterSpacing:1}}>Total del mes</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:"#2A7C6F",fontWeight:600}}>{"$"+totalMes.toLocaleString()}</div></div>
                <div style={{borderLeft:"1px solid #F3EDE4",paddingLeft:24}}><div style={{fontSize:11,color:"#8B7355",textTransform:"uppercase",letterSpacing:1}}>Ventas</div><div style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:600}}>{ventasMes.length}</div></div>
              </div>
              <button className="do-btn do-btn-pri" style={{background:"#C49A3C"}} onClick={()=>setShowVentaM({})}>{IC.plus} Nueva Venta</button>
            </div>
            <div className="do-tbl">
              <div className="do-tbl-hd"><h3>Ventas ({filtV.length})</h3><div className="do-filters">{["Todas","Efectivo","Tarjeta","Transferencia"].map(f=><Chip key={f} label={f} active={vF===f} onClick={()=>setVF(f)}/>)}</div></div>
              <div className="mob-list">{filtV.map((v,i)=>{const p=pacs.find(x=>x.id===v.pacienteId);return <div key={v.id} className="mob-card" onClick={()=>p&&setSelPat(p)}>
                <Av name={v.paciente} i={i}/>
                <div className="mob-card-body">
                  <div className="mob-card-name">{v.paciente}</div>
                  <div className="mob-card-sub" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.concepto}</div>
                  <div className="mob-card-meta"><Tag type={v.estado}/><span style={{fontSize:11,color:"#8B7355"}}>{v.metodo}</span></div>
                </div>
                <div className="mob-card-right">
                  <span style={{fontWeight:700,fontSize:15,color:"#2D2520"}}>{"$"+(v.monto||0).toLocaleString()}</span>
                  <div style={{display:"flex",gap:6}}>
                    {can(role,"ventas")&&<button className="do-btn-ic" onClick={e=>{e.stopPropagation();setShowVentaM(v)}}>{IC.pen}</button>}
                    {can(role,"ventas")&&<button className="do-btn-ic do-btn-ic-d" onClick={e=>{e.stopPropagation();deleteVenta(v.id)}}>{IC.trash}</button>}
                  </div>
                </div>
              </div>;})}
              </div>
              <table><thead><tr><th>Paciente</th><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Metodo</th><th>Estado</th><th></th></tr></thead>
              <tbody>{filtV.map((v,i)=>{const p=pacs.find(x=>x.id===v.pacienteId);return <tr key={v.id} onClick={()=>p&&setSelPat(p)}>
                <td><div className="do-pcell"><Av name={v.paciente} i={i}/><span className="do-pname">{v.paciente}</span></div></td>
                <td>{fmtD(v.fecha)}</td>
                <td style={{fontSize:12.5,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.concepto}</td>
                <td style={{fontWeight:600,fontSize:14,color:"#2D2520"}}>{"$"+(v.monto||0).toLocaleString()}</td>
                <td style={{fontSize:12,color:"#8B7355"}}>{v.metodo}</td>
                <td><Tag type={v.estado}/></td>
                <td onClick={e=>e.stopPropagation()}><div style={{display:"flex",gap:6}}>
                  {can(role,"ventas")&&<button className="do-btn-ic" onClick={()=>setShowVentaM(v)}>{IC.pen}</button>}
                  {can(role,"ventas")&&<button className="do-btn-ic do-btn-ic-d" onClick={()=>deleteVenta(v.id)}>{IC.trash}</button>}
                </div></td>
              </tr>;})}
              </tbody></table>
              {filtV.length===0&&<div className="do-empty"><h4>Sin ventas registradas</h4></div>}
            </div>
          </div>}

          {/* ── ARCHIVOS ── */}
          {view==="archivos"&&<div className="do-tbl">
            <div className="do-tbl-hd"><h3>Archivos ({archivos.length})</h3><button className="do-btn do-btn-pri" style={{fontSize:12}} onClick={()=>setShowUpload("")}>{IC.up} Subir</button></div>
            <table><thead><tr><th>Archivo</th><th>Paciente</th><th>Categoria</th><th>Fecha</th><th>Tamano</th><th></th></tr></thead>
            <tbody>{archivos.sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")).map((a,i)=>{const p=pacs.find(x=>x.id===a.pacienteId);return <tr key={a.id}>
              <td><div className="do-pcell"><span style={{fontSize:20}}>{a.tipo==="Imagen"?"🖼":"📄"}</span><div><div className="do-pname">{a.nombre}</div><div className="do-pdetail">{a.expedienteId?"Exp: "+a.expedienteId:"General"}</div></div></div></td>
              <td style={{cursor:"pointer",color:"#2A7C6F"}} onClick={()=>p&&setSelPat(p)}>{p?p.nombre:"?"}</td>
              <td><Tag type={a.categoria}/></td><td>{fmtD(a.fecha)}</td>
              <td style={{fontSize:12,color:"#C4B5A0"}}>{a.tamano}</td>
              <td><a href={a.url} target="_blank" rel="noopener noreferrer" className="do-btn do-btn-out" style={{fontSize:11,padding:"4px 10px"}}>{IC.dl} Abrir</a></td>
            </tr>;})}
            </tbody></table>
          </div>}
        </div>
      </main>
    </div>

    {/* Mobile bottom nav */}
    <nav className="mob-bottomnav">
      {[
        {key:"dashboard",  icon:IC.dash, label:"Panel"},
        {key:"pacientes",  icon:IC.usr,  label:"Pacientes"},
        {key:"citas",      icon:IC.cal,  label:"Agenda"},
        {key:"ventas",     icon:IC.bag,  label:"Ventas"},
        {key:"expedientes",icon:IC.eye,  label:"Clinica"},
      ].map(n=><button key={n.key} className={"mob-bn-item"+(view===n.key?" active":"")} onClick={()=>{setView(n.key);setMobNav(false);}}>
        {n.icon}<span style={{fontSize:10}}>{n.label}</span>
      </button>)}
    </nav>

    {/* FAB accion rapida */}
    <button className="do-fab" onClick={()=>{
      if(view==="pacientes")     setShowPacM({});
      else if(view==="citas")    setShowCitaM({});
      else if(view==="ventas")   setShowVentaM({});
      else if(view==="expedientes") setShowExpM({pacienteId:""});
      else if(view==="seguimientos") setShowSegM({});
      else setShowCitaM({});
    }}>+</button>

    {/* Ficha paciente */}
    {selPat&&<FichaCliente p={selPat} citas={citas} segs={segs} ventas={ventas} exps={exps} archivos={archivos}
      onClose={()=>setSelPat(null)} role={role}
      onAddExp={pid=>setShowExpM({pacienteId:pid})}
      onEditExp={ex=>setShowExpM({initial:ex,pacienteId:ex.pacienteId})}
      onDeleteExp={deleteExp}
      onUpload={pid=>setShowUpload(pid)}
      onEditPaciente={p=>{setSelPat(null);setTimeout(()=>setShowPacM(p),100);}}/>}

    {/* ── Modals ── */}
    {showPacM!==null&&<PacienteModal initial={showPacM.id?showPacM:null} pacs={pacs} onClose={()=>setShowPacM(null)} onSave={savePaciente}/>}
    {showCitaM!==null&&<CitaModal initial={showCitaM.id?showCitaM:null} pacs={pacs} onClose={()=>setShowCitaM(null)} onSave={saveCita}/>}
    {showExpM!==null&&<ExpModal pacienteId={showExpM.pacienteId} initial={showExpM.initial||null} pacs={pacs} onClose={()=>setShowExpM(null)} onSave={saveExp}/>}
    {showVentaM!==null&&<VentaModal initial={showVentaM.id?showVentaM:null} pacs={pacs} onClose={()=>setShowVentaM(null)} onSave={saveVenta}/>}
    {showSegM!==null&&<SegModal initial={showSegM.id?showSegM:null} pacs={pacs} onClose={()=>setShowSegM(null)} onSave={saveSeg}/>}
    {showUpload!==null&&<UploadModal pacienteId={showUpload} pacs={pacs} role={role} onClose={()=>setShowUpload(null)} onUploaded={a=>{setArchivos([a,...archivos]);setShowUpload(null);toast("Archivo subido");}}/>}
    {confirm&&<ConfirmModal msg={confirm.msg} onYes={()=>{confirm.onYes();setConfirm(null);}} onNo={()=>setConfirm(null)}/>}

    <ToastContainer toasts={toasts}/>
  </>;
}

// ═══ STYLES ═══
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=Playfair+Display:wght@400;500;600&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body,#root{font-family:'DM Sans',sans-serif;background:#FAF7F2;color:#4A3F35;min-height:100vh;-webkit-tap-highlight-color:transparent;}

/* ── Layout ── */
.do-layout{display:flex;min-height:100vh}
.do-side{width:260px;background:#2D2520;color:#fff;display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;transition:transform .25s cubic-bezier(.4,0,.2,1)}
.do-side-brand{padding:24px 24px 16px;border-bottom:1px solid rgba(255,255,255,.08)}
.do-side-brand h1{font-family:'Playfair Display',serif;font-size:22px;font-weight:500}
.do-side-brand p{font-size:11px;color:#C4B5A0;margin-top:3px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500}
.do-side-nav{padding:12px 12px 8px;flex:1;overflow-y:auto}
.do-side-label{font-size:10px;text-transform:uppercase;letter-spacing:1.8px;color:rgba(255,255,255,.3);padding:14px 12px 6px;font-weight:500}
.do-nav{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,.6);font-size:13.5px;transition:all .2s;border:none;background:none;width:100%;text-align:left;font-family:inherit;min-height:44px}
.do-nav:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.9)}
.do-nav.active{background:rgba(42,124,111,.25);color:#fff;font-weight:500}
.do-nav .do-badge{margin-left:auto;background:#D4726A;color:#fff;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px}
.do-side-ft{padding:12px 20px;border-top:1px solid rgba(255,255,255,.08);font-size:11px;color:rgba(255,255,255,.2);line-height:1.5}
.role-switch{padding:8px 12px;border-top:1px solid rgba(255,255,255,.06)}
.role-btn{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border:none;border-left:3px solid transparent;background:none;color:rgba(255,255,255,.45);font-size:12px;font-family:inherit;cursor:pointer;border-radius:0 6px 6px 0;transition:all .15s;margin-bottom:2px;min-height:40px}
.role-btn:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.8)}
.role-btn.active{background:rgba(255,255,255,.1);color:#fff;font-weight:500}
.role-badge{font-size:10px;padding:3px 10px;border-radius:12px;color:#fff;font-weight:600;letter-spacing:.5px}

/* ── Topbar ── */
.do-main{margin-left:260px;flex:1;min-height:100vh}
.do-top{background:#fff;border-bottom:1px solid #E8DFD1;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50;gap:12px;flex-wrap:wrap}
.do-top-title{font-family:'Playfair Display',serif;font-size:19px;font-weight:500;color:#2D2520}
.do-top-act{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.do-search{display:flex;align-items:center;gap:8px;background:#FAF7F2;border:1px solid #E8DFD1;border-radius:10px;padding:7px 12px;width:220px;transition:border-color .2s}
.do-search:focus-within{border-color:#2A7C6F}
.do-search input{border:none;background:none;font-family:inherit;font-size:13px;color:#4A3F35;outline:none;flex:1;min-width:0}
.do-search input::placeholder{color:#C4B5A0}
.do-page{padding:24px 28px}
.sec-title{font-family:'Playfair Display',serif;font-size:17px;margin-bottom:12px;font-weight:500}

/* ── Buttons ── */
.do-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;border:none;white-space:nowrap;text-decoration:none;min-height:40px}
.do-btn-pri{background:#2A7C6F;color:#fff}
.do-btn-pri:hover{background:#3A9B8C}
.do-btn-out{background:#fff;color:#4A3F35;border:1px solid #E8DFD1}
.do-btn-out:hover{border-color:#C4B5A0;background:#FAF7F2}
.do-btn-wa{background:#25D366;color:#fff;font-size:12px;padding:5px 10px;border-radius:6px;min-height:36px}
.do-btn-wa:hover{background:#20BD5A}
.do-btn-ic{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;border:1px solid #E8DFD1;background:#fff;cursor:pointer;color:#8B7355;transition:all .2s;padding:0;flex-shrink:0}
.do-btn-ic:hover{border-color:#2A7C6F;color:#2A7C6F;background:#E8F5F2}
.do-btn-ic-d:hover{border-color:#D4726A;color:#D4726A;background:#FDF0EE}
.do-mob-tog{display:none;background:none;border:none;cursor:pointer;color:#4A3F35;padding:6px;min-width:44px;min-height:44px;align-items:center;justify-content:center}

/* Overlay detrás del sidebar en móvil */
.mob-sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99;animation:doFadeIn .2s ease}

/* FAB — Floating Action Button (mobile) */
.do-fab{display:none;position:fixed;bottom:24px;right:20px;z-index:90;width:56px;height:56px;border-radius:28px;background:#2A7C6F;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(42,124,111,.35);font-size:24px;align-items:center;justify-content:center;transition:all .2s}
.do-fab:active{transform:scale(.94);background:#1f6057}

/* ── Stats ── */
.do-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.do-stat{background:#fff;border-radius:12px;padding:20px 22px;border:1px solid rgba(232,223,209,.6);transition:all .2s;animation:doFade .35s cubic-bezier(.4,0,.2,1) both}
.do-stat:hover{box-shadow:0 4px 16px rgba(74,63,53,.08);transform:translateY(-2px)}
.do-stat.s1{border-top:3px solid #2A7C6F;animation-delay:.05s}
.do-stat.s2{border-top:3px solid #4A7FB5;animation-delay:.1s}
.do-stat.s3{border-top:3px solid #D4726A;animation-delay:.15s}
.do-stat.s4{border-top:3px solid #C49A3C;animation-delay:.2s}
.do-stat-label{font-size:11px;color:#8B7355;text-transform:uppercase;letter-spacing:1px;font-weight:500;margin-bottom:6px}
.do-stat-val{font-family:'Playfair Display',serif;font-size:30px;font-weight:600;color:#2D2520}
.do-stat-sub{font-size:12px;color:#C4B5A0;margin-top:3px}

/* ── Table container ── */
.do-tbl{background:#fff;border-radius:12px;border:1px solid rgba(232,223,209,.6);overflow:hidden;animation:doFade .35s .15s cubic-bezier(.4,0,.2,1) both}
.do-tbl-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #F3EDE4;flex-wrap:wrap;gap:10px}
.do-tbl-hd h3{font-family:'Playfair Display',serif;font-size:16px;font-weight:500}
.do-filters{display:flex;gap:6px;flex-wrap:wrap}
.do-chip{padding:5px 13px;border-radius:20px;font-size:11.5px;font-weight:500;cursor:pointer;border:1px solid #E8DFD1;background:#fff;color:#8B7355;transition:all .2s;font-family:inherit;min-height:32px}
.do-chip:hover{border-color:#2A7C6F;color:#2A7C6F}
.do-chip.active{background:#2A7C6F;color:#fff;border-color:#2A7C6F}

/* ── Desktop table ── */
.do-tbl table{width:100%;border-collapse:collapse}
.do-tbl thead th{padding:10px 18px;text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:1.2px;color:#8B7355;font-weight:600;background:#FAF7F2;border-bottom:1px solid #F3EDE4}
.do-tbl tbody td{padding:12px 18px;font-size:13px;border-bottom:1px solid rgba(232,223,209,.4);vertical-align:middle}
.do-tbl tbody tr{transition:background .2s;cursor:pointer}
.do-tbl tbody tr:hover{background:rgba(232,223,209,.15)}
.do-tbl tbody tr:last-child td{border-bottom:none}

/* ── Mobile cards (reemplazan tablas en móvil) ── */
.mob-list{display:none;flex-direction:column}
.mob-card{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(232,223,209,.4);cursor:pointer;transition:background .15s;-webkit-user-select:none;user-select:none}
.mob-card:active{background:rgba(232,223,209,.3)}
.mob-card:last-child{border-bottom:none}
.mob-card-body{flex:1;min-width:0}
.mob-card-name{font-weight:600;font-size:14px;color:#2D2520;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mob-card-sub{font-size:12px;color:#8B7355;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mob-card-meta{display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap}
.mob-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
.mob-card-actions{display:flex;gap:6px;margin-top:6px}

/* ── Avatar / Tags ── */
.do-pcell{display:flex;align-items:center;gap:10px}
.do-av{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0}
.do-av-teal{background:#E8F5F2;color:#2A7C6F}
.do-av-coral{background:#FDF0EE;color:#D4726A}
.do-av-gold{background:#FBF5E8;color:#C49A3C}
.do-av-blue{background:#EDF3F9;color:#4A7FB5}
.do-pname{font-weight:500;color:#2D2520;font-size:13px}
.do-pdetail{font-size:11px;color:#C4B5A0}
.do-tag{display:inline-flex;padding:2px 9px;border-radius:5px;font-size:11px;font-weight:500}
.do-tag-nuevo,.do-tag-comercial,.do-tag-retinografia,.do-tag-receta{background:#E8F5F2;color:#2A7C6F}
.do-tag-recurrente,.do-tag-programado,.do-tag-recordatorio,.do-tag-paquimetria{background:#EDF3F9;color:#4A7FB5}
.do-tag-convenio,.do-tag-pendiente,.do-tag-apartado{background:#FBF5E8;color:#C49A3C}
.do-tag-confirmada,.do-tag-pagada,.do-tag-completado{background:#E8F5F2;color:#2A7C6F}
.do-tag-por-confirmar,.do-tag-salud,.do-tag-cancelada{background:#FDF0EE;color:#D4726A}

/* ── Alerts ── */
.do-alert{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#fff;border-radius:8px;border:1px solid rgba(232,223,209,.6);margin-bottom:6px}
.do-alert.urgent{border-left:3px solid #D4726A;background:#FDF0EE}
.do-alert.reminder{border-left:3px solid #C49A3C;background:#FBF5E8}
.do-alert-ic{flex-shrink:0;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.do-alert-ic.u{background:rgba(212,114,106,.15);color:#D4726A}
.do-alert-ic.r{background:rgba(196,154,60,.15);color:#C49A3C}
.do-alert-c{flex:1}
.do-alert-t{font-size:13px;font-weight:500;color:#2D2520}
.do-alert-s{font-size:11.5px;color:#8B7355;margin-top:1px}

/* ── Modal ── */
.do-modal-ov{position:fixed;inset:0;background:rgba(45,37,32,.45);z-index:300;display:flex;align-items:center;justify-content:center;animation:doFadeIn .15s ease}
.do-modal{background:#fff;border-radius:12px;width:520px;max-height:88vh;overflow-y:auto;box-shadow:0 8px 32px rgba(74,63,53,.15);animation:doModalIn .2s cubic-bezier(.4,0,.2,1)}
.do-modal-wide{width:680px}
.do-modal-hd{padding:20px 24px;border-bottom:1px solid #F3EDE4;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1;border-radius:12px 12px 0 0}
.do-modal-hd h3{font-family:'Playfair Display',serif;font-size:18px;font-weight:500}
.do-modal-body{padding:24px}
.do-modal-ft{padding:14px 24px;border-top:1px solid #F3EDE4;display:flex;justify-content:flex-end;gap:10px;background:#FAF7F2;border-radius:0 0 12px 12px;position:sticky;bottom:0}
.do-close{background:none;border:none;cursor:pointer;color:#C4B5A0;padding:4px;border-radius:6px;transition:all .2s;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center}
.do-close:hover{background:#F3EDE4;color:#4A3F35}

/* ── Form fields ── */
.do-fg{margin-bottom:16px}
.do-fl{display:block;font-size:11px;font-weight:500;color:#8B7355;margin-bottom:5px;text-transform:uppercase;letter-spacing:.8px}
.do-fi{width:100%;padding:11px 13px;border:1px solid #E8DFD1;border-radius:8px;font-family:inherit;font-size:16px;color:#4A3F35;background:#fff;transition:border-color .2s;outline:none;-webkit-appearance:none}
.do-fi:focus{border-color:#2A7C6F}
.do-ta{resize:vertical;min-height:70px;font-size:15px}
.do-fr{display:grid;grid-template-columns:1fr 1fr;gap:12px}

/* ── Ficha / slide panel ── */
.do-overlay{position:fixed;inset:0;background:rgba(45,37,32,.35);z-index:200;animation:doFadeIn .2s ease}
.do-ficha{position:fixed;top:0;right:0;bottom:0;width:680px;background:#fff;z-index:201;overflow-y:auto;box-shadow:-8px 0 32px rgba(45,37,32,.15);animation:doSlide .25s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column}
.gsearch-box{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid #E8DFD1;border-radius:10px;box-shadow:0 8px 24px rgba(74,63,53,.12);z-index:200;max-height:400px;overflow-y:auto}
.gsearch-section{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#8B7355;font-weight:600;padding:10px 14px 4px}
.gsearch-row{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .15s}
.gsearch-row:hover{background:#FAF7F2}
.gsearch-name{font-size:13px;font-weight:500;color:#2D2520}
.gsearch-sub{font-size:11px;color:#C4B5A0;margin-top:2px;display:flex;gap:6px;align-items:center}
.gsearch-icon{font-size:20px;width:34px;text-align:center;flex-shrink:0}
.gsearch-empty{padding:16px 14px;font-size:13px;color:#C4B5A0;text-align:center}
.mob-back-bar{display:none;padding:10px 16px;border-bottom:1px solid #F3EDE4;flex-shrink:0;background:#FDFBF8}
.mob-back-btn{display:flex;align-items:center;gap:6px;background:none;border:none;color:#2A7C6F;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:6px 8px;border-radius:8px;min-height:40px}
.mob-back-btn:active{background:#E8F5F2}
.ficha-hd{padding:20px 24px;border-bottom:1px solid #F3EDE4;display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0}
.ficha-name{font-family:'Playfair Display',serif;font-size:22px;font-weight:500;color:#2D2520}
.ficha-tabs{display:flex;border-bottom:1px solid #F3EDE4;padding:0 24px;flex-shrink:0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.ficha-tabs::-webkit-scrollbar{display:none}
.ficha-tab{padding:12px 16px;font-size:12.5px;font-weight:500;color:#8B7355;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;font-family:inherit;white-space:nowrap;min-height:44px}
.ficha-tab:hover{color:#2D2520}
.ficha-tab.active{color:#2A7C6F;border-bottom-color:#2A7C6F}
.ficha-body{padding:24px;flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch}
.ficha-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}

/* ── Detail sections ── */
.do-dsec{margin-bottom:20px}
.do-dsec-t{font-size:10.5px;text-transform:uppercase;letter-spacing:1.5px;color:#8B7355;font-weight:600;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #F3EDE4}
.do-df{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;border-bottom:1px solid rgba(232,223,209,.3)}
.do-df:last-child{border-bottom:none}
.do-df-l{color:#C4B5A0;flex-shrink:0}
.do-df-v{color:#2D2520;font-weight:500;text-align:right;max-width:65%}
.do-notes{background:#FAF7F2;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.6;color:#4A3F35;border:1px solid #F3EDE4}
.list-row{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #F3EDE4}
.list-row:last-child{border-bottom:none}

/* ── Expediente cards ── */
.exp-card{border:1px solid #E8DFD1;border-radius:10px;margin-bottom:10px;overflow:hidden;transition:all .2s}
.exp-card:hover{box-shadow:0 2px 8px rgba(74,63,53,.06)}
.exp-card-hd{padding:14px 18px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#FDFBF8}
.exp-card-date{font-weight:600;font-size:14px;color:#2D2520}
.exp-card-motivo{font-size:12.5px;color:#8B7355;margin-top:2px}
.exp-card-opto{font-size:11px;color:#C4B5A0;margin-top:2px}
.exp-chev{transition:transform .2s;display:flex}
.exp-chev-open{transform:rotate(90deg)}
.exp-card-body{padding:18px;border-top:1px solid #F3EDE4;animation:doFade .2s ease}
.exp-section{margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(243,237,228,.6)}
.exp-section:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.exp-sec-title{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#8B7355;font-weight:600;margin-bottom:8px}
.exp-text{font-size:13px;line-height:1.6;color:#4A3F35}
.exp-diag{font-size:13.5px;font-weight:500;color:#2D2520;line-height:1.5}
.exp-diag-alert{color:#D4726A;background:#FDF0EE;padding:10px 14px;border-radius:8px;border:1px solid rgba(212,114,106,.2)}
.exp-form-section{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#2A7C6F;font-weight:600;margin:20px 0 12px;padding-top:16px;border-top:1px solid #F3EDE4}

/* ── Rx grid ── */
.rx-grid{display:grid;grid-template-columns:40px repeat(5,1fr);gap:1px;background:#F3EDE4;border-radius:8px;overflow:hidden;margin-bottom:8px;font-size:13px}
.rx-compact{font-size:12px}
.rx-header{background:#FAF7F2;padding:6px 4px;font-size:9px;font-weight:600;color:#8B7355;text-transform:uppercase;text-align:center}
.rx-eye{background:#FAF7F2;padding:8px;font-weight:600;color:#2D2520;text-align:center;font-size:12px}
.rx-cell{background:#fff;padding:8px 4px;text-align:center}
.rx-val{font-weight:500;color:#2D2520}
.rx-dnp{font-size:12px;color:#8B7355;text-align:right;margin-top:4px}
.rx-form{margin-bottom:16px}
.rx-form-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.rx-form-label{font-weight:600;font-size:13px;color:#2D2520;width:28px;flex-shrink:0;text-align:center}
.rx-fi{flex:1;text-align:center;padding:10px 4px !important;font-size:14px !important}

/* ── Archivos ── */
.arc-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F3EDE4}
.arc-row:last-child{border-bottom:none}
.arc-icon{font-size:22px;flex-shrink:0;width:36px;text-align:center}
.arc-info{flex:1;min-width:0}
.arc-name{font-weight:500;font-size:13px;color:#2D2520;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arc-meta{font-size:11px;color:#C4B5A0;margin-top:2px}

/* ── Empty ── */
.do-empty{text-align:center;padding:40px 24px;color:#C4B5A0}
.do-empty h4{font-family:'Playfair Display',serif;font-size:15px;color:#8B7355;margin-bottom:4px}
.do-empty p{font-size:12px}

/* ── Bottom nav (mobile) ── */
.mob-bottomnav{display:none;position:fixed;bottom:0;left:0;right:0;background:#2D2520;z-index:99;flex-direction:row;border-top:1px solid rgba(255,255,255,.08);padding-bottom:env(safe-area-inset-bottom)}
.mob-bn-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 4px 8px;border:none;background:none;cursor:pointer;color:rgba(255,255,255,.45);font-size:10px;font-family:inherit;gap:3px;min-height:56px;transition:color .15s;position:relative}
.mob-bn-item.active{color:#fff}
.mob-bn-item svg{opacity:.7}
.mob-bn-item.active svg{opacity:1}
.mob-bn-badge{position:absolute;top:8px;right:calc(50% - 18px);background:#D4726A;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center}

/* ── Breakpoints ── */
@media(max-width:1100px){
  .do-stats{grid-template-columns:repeat(2,1fr)}
  .do-ficha{width:100%}
  .ficha-grid{grid-template-columns:1fr}
}

@media(max-width:768px){
  /* Sidebar oculto — se usa bottom nav */
  .do-side{transform:translateX(-100%)}
  .do-side.open{transform:translateX(0);z-index:150}
  .do-main{margin-left:0;padding-bottom:70px}
  .do-top{padding:10px 14px}
  .do-page{padding:12px 14px}
  .do-mob-tog{display:flex !important}
  .do-search{width:100%}
  .mob-sidebar-overlay{display:block}

  /* Stats 2x2 en móvil */
  .do-stats{grid-template-columns:1fr 1fr;gap:10px}
  .do-stat{padding:14px 16px}
  .do-stat-val{font-size:22px}

  /* Ocultar tablas, mostrar cards */
  .do-tbl table{display:none}
  .do-tbl .mob-list{display:flex !important}
  .do-tbl-hd{padding:12px 16px}

  /* Ficha full screen en móvil */
  .do-ficha{width:100%;left:0;animation:doSlideUp .25s cubic-bezier(.4,0,.2,1)}
  .ficha-grid{grid-template-columns:1fr}
  .mob-back-bar{display:block}

  /* Modal bottom sheet en móvil */
  .do-modal-ov{align-items:flex-end}
  .do-modal,.do-modal-wide{width:100%;max-width:100%;border-radius:16px 16px 0 0;max-height:92vh;animation:doSheetUp .25s cubic-bezier(.4,0,.2,1)}
  .do-modal-hd{border-radius:16px 16px 0 0}
  .do-modal-body{padding:16px 18px}
  .do-modal-ft{padding:12px 18px;gap:8px}
  .do-modal-ft .do-btn{flex:1;justify-content:center}

  /* Formularios más cómodos en móvil */
  .do-fr{grid-template-columns:1fr}
  .do-fi{font-size:16px;padding:12px 13px}
  .do-btn{min-height:48px;font-size:14px}
  .do-btn-wa{min-height:40px}
  .do-btn-ic{width:40px;height:40px}

  /* Bottom nav visible */
  .mob-bottomnav{display:flex !important}
  .do-fab{display:flex !important}

  /* Ocultar top-act buttons (están en FAB) */
  .do-top-act .do-btn:not(.do-btn-pri){display:none}

  /* Rx grid más compacto */
  .rx-grid{font-size:11px}
  .rx-fi{font-size:13px !important;padding:8px 2px !important}
}

@keyframes doFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes doFadeIn{from{opacity:0}to{opacity:1}}
@keyframes doSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes doSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes doSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes doModalIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}

::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#E8DFD1;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#C4B5A0}
`;
