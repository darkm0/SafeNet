const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND = path.join(__dirname, "..", "frontend");
const DATA = process.env.SAFENET_DATA_DIR || path.join(__dirname, "data");
const dbPool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 }) : null;
let storeReady = false;
let persistenceQueue = Promise.resolve();
const files = {
  feedback: path.join(DATA,"feedback.json"), scenarios:path.join(DATA,"scenarios.json"), settings:path.join(DATA,"settings.json"), users:path.join(DATA,"users.json"),
  resources:path.join(DATA,"resources.json"), quizzes:path.join(DATA,"quizzes.json"), reports:path.join(DATA,"reports.json"), certificates:path.join(DATA,"certificates.json"),
  announcements:path.join(DATA,"announcements.json"), audit:path.join(DATA,"audit.json"), admin:path.join(DATA,"admin.json")
};
const DEFAULT_SETTINGS={siteTitle:"SafeNet — Online Safety for Everyone",heroEyebrow:"ONLINE SAFETY • INTERACTIVE LEARNING",creatorName:"Supraj Sunil Panchal",rollNo:"72",announcement:"Stop → Think → Check → Protect → Report → Tell",maintenance:false};
const USER_TYPES=["child","adolescent","school","college","professional","citizen","senior","parent","everyone","gaming"];
const fallbacks={feedback:[],scenarios:[],settings:DEFAULT_SETTINGS,users:[],resources:[],quizzes:[],reports:[],certificates:[],announcements:[],audit:[],admin:{}};
function ensure(file,fallback){if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(fallback,null,2));}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch{return fallback;}}
function keyForFile(file){return Object.keys(files).find(k=>files[k]===file);}
function write(file,val){
  fs.writeFileSync(file,JSON.stringify(val,null,2));
  const key=keyForFile(file);
  if(dbPool && storeReady && key){
    const json=JSON.stringify(val);
    persistenceQueue=persistenceQueue.then(()=>dbPool.query(
      "INSERT INTO safenet_json_store (store_key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (store_key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()",
      [key,json]
    )).catch(err=>{console.error(`Database persistence failed for ${key}:`,err.message);});
  }
}
function initLocalFiles(){Object.entries(files).forEach(([k,f])=>{ensure(f,fallbacks[k]);});}
let settings={...DEFAULT_SETTINGS};
function now(){return new Date().toISOString();}
function clean(v,max=4000){return String(v??"").trim().slice(0,max);}
function email(v){return clean(v,160).toLowerCase();}
function bool(v){return v===true||v==="true"||v===1||v==="1";}
function nextId(rows){return rows.reduce((m,x)=>Math.max(m,Number(x.id)||0),0)+1;}
function nextReg(prefix, rows){const n=rows.length+1;return `${prefix}-${new Date().getFullYear()}-${String(n).padStart(4,"0")}`;}
function token(){return crypto.randomBytes(32).toString("hex");}
function hashPassword(password){const salt=crypto.randomBytes(16).toString("hex");const key=crypto.scryptSync(String(password),salt,64);return `scrypt$${salt}$${key.toString("hex")}`;}
function verifyPassword(password,stored){try{const [scheme,salt,hex]=String(stored).split("$");if(scheme!=="scrypt"||!salt||!hex)return false;const a=Buffer.from(hex,"hex"),b=crypto.scryptSync(String(password),salt,64);return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}}
function validPassword(p){return typeof p==="string"&&p.length>=8&&p.length<=200;}
function safeUser(u){const {passwordHash,...safe}=u;return safe;}
function logAudit(action,actor,details={}){const rows=read(files.audit,[]);rows.unshift({id:Date.now()+Math.random(),action,actor:clean(actor,120)||"system",details,createdAt:now()});write(files.audit,rows.slice(0,1000));}
function setupAdmin(){let a=read(files.admin,{});if(!a.username||!a.passwordHash){a.username=process.env.SAFENET_ADMIN_USER||"admin";a.passwordHash=hashPassword(process.env.SAFENET_ADMIN_PASSWORD||"SafeNet@2026");a.createdAt=now();write(files.admin,a);}return a;}
let admin;
const adminSessions=new Map(), userSessions=new Map(), attempts=new Map();
function ip(req){return req.ip||req.socket?.remoteAddress||"unknown";}
function throttle(req,res,next){const k=ip(req),r=attempts.get(k)||{count:0,first:Date.now()};if(Date.now()-r.first>60000){r.count=0;r.first=Date.now();}if(r.count>=8)return res.status(429).json({success:false,message:"Too many attempts. Try again in a minute."});req._attempt=r;req._attemptKey=k;next();}
function publicAuth(req,res,next){const t=req.get("x-user-token");const s=t&&userSessions.get(t);if(!s||s.expires<Date.now()){if(t)userSessions.delete(t);return res.status(401).json({success:false,message:"Login required"});}s.expires=Date.now()+12*60*60*1000;req.userSession=s;next();}
function adminAuth(req,res,next){const t=req.get("x-admin-token");const s=t&&adminSessions.get(t);if(!s||s.expires<Date.now()){if(t)adminSessions.delete(t);return res.status(401).json({success:false,message:"Admin login required"});}s.expires=Date.now()+8*60*60*1000;req.admin=s;next();}
app.use(cors({origin:true}));app.use(express.json({limit:"3mb"}));app.use(express.urlencoded({extended:true}));app.use(express.static(FRONTEND));
app.get("/api/health",(_,res)=>res.json({success:true,status:"online",service:"SafeNet API",version:"17"}));
app.get("/api/settings",(_,res)=>res.json({success:true,settings:{...DEFAULT_SETTINGS,...read(files.settings,{})}}));
app.get("/api/announcements",(req,res)=>{const a=read(files.announcements,[]).filter(x=>x.active!==false);const audience=clean(req.query.audience,30);res.json({success:true,announcements:a.filter(x=>!audience||x.audience==="everyone"||x.audience===audience)});});
app.get("/api/scenarios",(req,res)=>{const rows=read(files.scenarios,[]),cat=clean(req.query.category,120).toLowerCase(),q=clean(req.query.search,200).toLowerCase();const out=rows.filter(s=>(!cat||clean(s.category,120).toLowerCase()===cat)&&(!q||clean(s.q,3000).toLowerCase().includes(q)||clean(s.category,120).toLowerCase().includes(q)));res.json({success:true,total:rows.length,count:out.length,categories:[...new Set(rows.map(s=>s.category))],scenarios:out});});
app.get("/api/scenarios/stats",(_,res)=>{const rows=read(files.scenarios,[]),byCategory={};rows.forEach(s=>byCategory[s.category]=(byCategory[s.category]||0)+1);res.json({success:true,total:rows.length,byCategory});});
app.get("/api/resources",(req,res)=>{const rows=read(files.resources,[]),aud=clean(req.query.audience,40).toLowerCase();res.json({success:true,resources:rows.filter(r=>r.active!==false&&(!aud||r.audience==="everyone"||r.audience===aud))});});
app.get("/api/quizzes",(req,res)=>{const rows=read(files.quizzes,[]),aud=clean(req.query.audience,40).toLowerCase();res.json({success:true,quizzes:rows.filter(q=>!aud||q.audience==="everyone"||q.audience===aud).sort((a,b)=>a.id-b.id)});});
app.post("/api/feedback",(req,res)=>{if(!clean(req.body?.message,2000))return res.status(400).json({success:false,message:"Message required"});const rows=read(files.feedback,[]);rows.push({id:Date.now(),name:clean(req.body.name,80),email:email(req.body.email),message:clean(req.body.message,2000),createdAt:now()});write(files.feedback,rows);logAudit("feedback.submit",req.body.email||"public");res.json({success:true});});
app.post("/api/reports",(req,res)=>{const b=req.body||{};const report={id:Date.now(),name:clean(b.name,100),email:email(b.email),category:clean(b.category,100),description:clean(b.description,2000),status:"new",source:"SafeNet practice report",createdAt:now(),updatedAt:now()};if(!report.category||!report.description)return res.status(400).json({success:false,message:"Category and description are required"});const rows=read(files.reports,[]);rows.unshift(report);write(files.reports,rows);logAudit("report.submit",report.email||report.name,{category:report.category});res.json({success:true,id:report.id});});
// Public user registration/authentication
app.post("/api/auth/register",throttle,(req,res)=>{const b=req.body||{},name=clean(b.name,120),em=email(b.email),un=clean(b.username,80).toLowerCase(),pw=String(b.password||""),type=USER_TYPES.includes(clean(b.type,40).toLowerCase())?clean(b.type,40).toLowerCase():"everyone";if(!name||!em||!un||!validPassword(pw))return res.status(400).json({success:false,message:"Name, email, username and a password of at least 8 characters are required."});const rows=read(files.users,[]);if(rows.some(u=>u.email===em))return res.status(409).json({success:false,message:"That email is already registered."});if(rows.some(u=>u.username===un))return res.status(409).json({success:false,message:"That username is already in use."});const id=nextId(rows),prefix=type==="senior"?"SNR":type==="college"?"COL":type==="school"?"SCH":type==="child"?"CHD":type==="adolescent"?"TEEN":type==="professional"?"PRO":type==="parent"?"PAR":"USR";const u={id,registrationId:clean(b.registrationId,50)||nextReg(prefix,rows),name,email:em,username:un,type,classLevel:clean(b.classLevel,80),city:clean(b.city,100),status:"active",notes:"",createdAt:now(),updatedAt:now(),lastLogin:now(),progress:{lessonsCompleted:[],scenarioIds:[],quizScores:{}},certificates:[],mustReset:false,passwordHash:hashPassword(pw)};rows.push(u);write(files.users,rows);const t=token();userSessions.set(t,{userId:id,username:un,createdAt:Date.now(),expires:Date.now()+12*60*60*1000});logAudit("user.register",un,{type,registrationId:u.registrationId});res.json({success:true,token:t,user:safeUser(u)});});
app.post("/api/auth/login",throttle,(req,res)=>{const ident=clean(req.body?.identifier,160).toLowerCase(),pw=String(req.body?.password||""),rows=read(files.users,[]);const u=rows.find(x=>x.email===ident||x.username===ident);if(!u||u.status==="blocked"||!verifyPassword(pw,u.passwordHash)){req._attempt.count+=1;attempts.set(req._attemptKey,req._attempt);return res.status(401).json({success:false,message:"Invalid email/username or password."});}req._attempt.count=0;attempts.delete(req._attemptKey);u.lastLogin=now();u.updatedAt=now();write(files.users,rows);const t=token();userSessions.set(t,{userId:u.id,username:u.username,createdAt:Date.now(),expires:Date.now()+12*60*60*1000});logAudit("user.login",u.username);res.json({success:true,token:t,user:safeUser(u),mustReset:!!u.mustReset});});
app.post("/api/auth/logout",publicAuth,(req,res)=>{const t=req.get("x-user-token");if(t)userSessions.delete(t);res.json({success:true});});
app.get("/api/auth/me",publicAuth,(req,res)=>{const u=read(files.users,[]).find(x=>x.id===req.userSession.userId);if(!u)return res.status(404).json({success:false,message:"User not found"});res.json({success:true,user:safeUser(u)});});
app.put("/api/auth/password",publicAuth,(req,res)=>{const rows=read(files.users,[]),u=rows.find(x=>x.id===req.userSession.userId),old=String(req.body?.currentPassword||""),nw=String(req.body?.newPassword||"");if(!u||( !u.mustReset && !verifyPassword(old,u.passwordHash)))return res.status(401).json({success:false,message:"Current password is incorrect."});if(!validPassword(nw))return res.status(400).json({success:false,message:"New password must be at least 8 characters."});u.passwordHash=hashPassword(nw);u.mustReset=false;u.updatedAt=now();write(files.users,rows);logAudit("user.password_change",u.username);res.json({success:true});});
app.get("/api/user/dashboard",publicAuth,(req,res)=>{const u=read(files.users,[]).find(x=>x.id===req.userSession.userId);if(!u)return res.status(404).json({success:false,message:"User not found"});const certs=read(files.certificates,[]).filter(c=>c.userId===u.id);res.json({success:true,user:safeUser(u),certificates:certs.map(({internalCode,...c})=>c)});});
app.post("/api/user/progress",publicAuth,(req,res)=>{const rows=read(files.users,[]),u=rows.find(x=>x.id===req.userSession.userId),p=req.body||{};if(!u)return res.status(404).json({success:false,message:"User not found"});u.progress=u.progress||{lessonsCompleted:[],scenarioIds:[],quizScores:{}};if(Array.isArray(p.lessonsCompleted))u.progress.lessonsCompleted=[...new Set(p.lessonsCompleted.map(Number).filter(Number.isFinite))].slice(0,500);if(Array.isArray(p.scenarioIds))u.progress.scenarioIds=[...new Set(p.scenarioIds.map(Number).filter(Number.isFinite))].slice(0,500);if(p.quizScores&&typeof p.quizScores==="object"){u.progress.quizScores={...u.progress.quizScores,...Object.fromEntries(Object.entries(p.quizScores).slice(-50).map(([k,v])=>[clean(k,60),Number(v)||0]))};}u.updatedAt=now();write(files.users,rows);res.json({success:true,progress:u.progress});});
app.post("/api/user/certificate",publicAuth,(req,res)=>{const rows=read(files.users,[]),u=rows.find(x=>x.id===req.userSession.userId);if(!u)return res.status(404).json({success:false,message:"User not found"});const p=u.progress||{},activities=(p.lessonsCompleted?.length||0)+(p.scenarioIds?.length||0)+Object.keys(p.quizScores||{}).length;if(activities<5)return res.status(400).json({success:false,message:"Complete at least 5 learning activities first."});const certs=read(files.certificates,[]);const existing=certs.find(c=>c.userId===u.id);if(existing)return res.json({success:true,certificate:existing});const cert={id:nextId(certs),userId:u.id,name:u.name,registrationId:u.registrationId,title:"SafeNet Online Safety Awareness Certificate",issuedAt:now(),internalCode:crypto.randomBytes(12).toString("hex")};certs.unshift(cert);write(files.certificates,certs);u.certificates=[...(u.certificates||[]),cert.id];write(files.users,rows);logAudit("certificate.issue",u.username,{certificateId:cert.id});res.json({success:true,certificate:cert});});
// Admin auth
app.post("/api/admin/login",throttle,(req,res)=>{admin=setupAdmin();const un=clean(req.body?.username,100),pw=String(req.body?.password||"");if(un!==admin.username||!verifyPassword(pw,admin.passwordHash)){req._attempt.count+=1;attempts.set(req._attemptKey,req._attempt);return res.status(401).json({success:false,message:"Invalid administrator credentials"});}attempts.delete(req._attemptKey);const t=token();adminSessions.set(t,{username:admin.username,createdAt:Date.now(),expires:Date.now()+8*60*60*1000});logAudit("admin.login",admin.username);res.json({success:true,token:t,username:admin.username,expiresIn:8*60*60*1000});});
app.post("/api/admin/logout",adminAuth,(req,res)=>{const t=req.get("x-admin-token");if(t)adminSessions.delete(t);res.json({success:true});});
app.get("/api/admin/me",adminAuth,(req,res)=>res.json({success:true,username:req.admin.username,expiresAt:req.admin.expires}));
app.get("/api/admin/dashboard",adminAuth,(req,res)=>{const us=read(files.users,[]),fb=read(files.feedback,[]),rp=read(files.reports,[]),rs=read(files.resources,[]),qs=read(files.quizzes,[]),cs=read(files.certificates,[]),sc=read(files.scenarios,[]);const byType={};us.forEach(u=>byType[u.type]=(byType[u.type]||0)+1);res.json({success:true,stats:{totalUsers:us.length,byType,scenarios:sc.length,feedback:fb.length,reports:rp.length,resources:rs.length,quizQuestions:qs.length,certificates:cs.length}});});
function genericList(file,req,res){let rows=read(file,[]);const search=clean(req.query.search,200).toLowerCase();if(search)rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(search));res.json({success:true,rows});}
function genericCreate(file,body,defaults={}){const rows=read(file,[]),row={...defaults,...body,id:nextId(rows),createdAt:now(),updatedAt:now()};rows.unshift(row);write(file,rows);return row;}
function genericUpdate(file,id,body){const rows=read(file,[]),i=rows.findIndex(x=>Number(x.id)===Number(id));if(i<0)return null;rows[i]={...rows[i],...body,id:rows[i].id,updatedAt:now()};write(file,rows);return rows[i];}
function genericDelete(file,id){const rows=read(file,[]),out=rows.filter(x=>Number(x.id)!==Number(id));if(out.length===rows.length)return false;write(file,out);return true;}
app.get("/api/admin/users",adminAuth,(req,res)=>{let rows=read(files.users,[]);const type=clean(req.query.type,40),search=clean(req.query.search,200).toLowerCase();if(type)rows=rows.filter(u=>u.type===type);if(search)rows=rows.filter(u=>[u.name,u.email,u.username,u.registrationId,u.city,u.classLevel].some(v=>String(v||"").toLowerCase().includes(search)));res.json({success:true,users:rows.map(safeUser)});});
app.post("/api/admin/users",adminAuth,(req,res)=>{const b=req.body||{},rows=read(files.users,[]),type=USER_TYPES.includes(b.type)?b.type:"everyone",un=clean(b.username,80).toLowerCase(),em=email(b.email);if(!clean(b.name,120))return res.status(400).json({success:false,message:"Name required"});if(em&&rows.some(u=>u.email===em))return res.status(409).json({success:false,message:"Email exists"});if(un&&rows.some(u=>u.username===un))return res.status(409).json({success:false,message:"Username exists"});const row={id:nextId(rows),registrationId:clean(b.registrationId,50)||nextReg(type.toUpperCase().slice(0,3),rows),name:clean(b.name,120),email:em,username:un||`user${Date.now()}`,type,classLevel:clean(b.classLevel,80),city:clean(b.city,100),status:["active","inactive","blocked"].includes(b.status)?b.status:"active",notes:clean(b.notes,1000),createdAt:now(),updatedAt:now(),lastLogin:null,progress:{lessonsCompleted:[],scenarioIds:[],quizScores:{}},certificates:[],passwordHash:hashPassword(crypto.randomBytes(24).toString("hex"))};rows.unshift(row);write(files.users,rows);logAudit("admin.user.create",req.admin.username,{id:row.id});res.json({success:true,user:safeUser(row)});});
app.put("/api/admin/users/:id",adminAuth,(req,res)=>{const rows=read(files.users,[]),i=rows.findIndex(x=>Number(x.id)===Number(req.params.id));if(i<0)return res.status(404).json({success:false,message:"User not found"});const existing=rows[i];const next={...existing,name:clean(req.body.name,120)||existing.name,email:email(req.body.email)||existing.email,username:clean(req.body.username,80).toLowerCase()||existing.username,type:USER_TYPES.includes(req.body.type)?req.body.type:existing.type,registrationId:clean(req.body.registrationId,50)||existing.registrationId,classLevel:clean(req.body.classLevel,80),city:clean(req.body.city,100),status:["active","inactive","blocked"].includes(req.body.status)?req.body.status:existing.status,notes:clean(req.body.notes,1000),updatedAt:now()};rows[i]=next;write(files.users,rows);logAudit("admin.user.update",req.admin.username,{id:req.params.id});res.json({success:true,user:safeUser(next)});});
app.delete("/api/admin/users/:id",adminAuth,(req,res)=>{if(!genericDelete(files.users,req.params.id))return res.status(404).json({success:false,message:"User not found"});logAudit("admin.user.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.post("/api/admin/users/:id/force-reset",adminAuth,(req,res)=>{const rows=read(files.users,[]),i=rows.findIndex(x=>Number(x.id)===Number(req.params.id));if(i<0)return res.status(404).json({success:false,message:"User not found"});rows[i].mustReset=true;rows[i].updatedAt=now();write(files.users,rows);logAudit("admin.user.force_reset",req.admin.username,{id:req.params.id});res.json({success:true,message:"Password reset required at next user login. No password was shown to the administrator."});});
app.get("/api/admin/scenarios",adminAuth,(req,res)=>{res.json({success:true,scenarios:read(files.scenarios,[])});});
app.post("/api/admin/scenarios",adminAuth,(req,res)=>{const row=genericCreate(files.scenarios,{category:clean(req.body.category,120),q:clean(req.body.q,3000),options:Array.isArray(req.body.options)?req.body.options.map(x=>clean(x,800)).filter(Boolean):[],answer:Number(req.body.answer)||0,why:clean(req.body.why,3000)});logAudit("admin.scenario.create",req.admin.username,{id:row.id});res.json({success:true,scenario:row});});
app.put("/api/admin/scenarios/:id",adminAuth,(req,res)=>{const row=genericUpdate(files.scenarios,req.params.id,{category:clean(req.body.category,120),q:clean(req.body.q,3000),options:Array.isArray(req.body.options)?req.body.options.map(x=>clean(x,800)).filter(Boolean):[],answer:Number(req.body.answer)||0,why:clean(req.body.why,3000)});if(!row)return res.status(404).json({success:false,message:"Scenario not found"});logAudit("admin.scenario.update",req.admin.username,{id:req.params.id});res.json({success:true,scenario:row});});
app.delete("/api/admin/scenarios/:id",adminAuth,(req,res)=>{if(!genericDelete(files.scenarios,req.params.id))return res.status(404).json({success:false,message:"Scenario not found"});logAudit("admin.scenario.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/resources",adminAuth,(req,res)=>genericList(files.resources,req,res));
app.post("/api/admin/resources",adminAuth,(req,res)=>{const row=genericCreate(files.resources,{type:req.body.type==="lesson"?"lesson":"video",audience:clean(req.body.audience,40)||"everyone",category:clean(req.body.category,100),title:clean(req.body.title,160),source:clean(req.body.source,100),url:clean(req.body.url,500),description:clean(req.body.description,1000),active:req.body.active!==false});logAudit("admin.resource.create",req.admin.username,{id:row.id});res.json({success:true,row});});
app.put("/api/admin/resources/:id",adminAuth,(req,res)=>{const row=genericUpdate(files.resources,req.params.id,{...req.body,type:req.body.type==="lesson"?"lesson":"video",active:bool(req.body.active)});if(!row)return res.status(404).json({success:false,message:"Resource not found"});logAudit("admin.resource.update",req.admin.username,{id:req.params.id});res.json({success:true,row});});
app.delete("/api/admin/resources/:id",adminAuth,(req,res)=>{if(!genericDelete(files.resources,req.params.id))return res.status(404).json({success:false,message:"Resource not found"});logAudit("admin.resource.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/quizzes",adminAuth,(req,res)=>genericList(files.quizzes,req,res));
app.post("/api/admin/quizzes",adminAuth,(req,res)=>{const row=genericCreate(files.quizzes,{audience:clean(req.body.audience,40)||"everyone",category:clean(req.body.category,100),q:clean(req.body.q,1500),options:Array.isArray(req.body.options)?req.body.options.map(x=>clean(x,500)):[],answer:Number(req.body.answer)||0,why:clean(req.body.why,1500)});logAudit("admin.quiz.create",req.admin.username,{id:row.id});res.json({success:true,row});});
app.put("/api/admin/quizzes/:id",adminAuth,(req,res)=>{const row=genericUpdate(files.quizzes,req.params.id,{...req.body,answer:Number(req.body.answer)||0,options:Array.isArray(req.body.options)?req.body.options.map(x=>clean(x,500)):[]});if(!row)return res.status(404).json({success:false,message:"Quiz not found"});logAudit("admin.quiz.update",req.admin.username,{id:req.params.id});res.json({success:true,row});});
app.delete("/api/admin/quizzes/:id",adminAuth,(req,res)=>{if(!genericDelete(files.quizzes,req.params.id))return res.status(404).json({success:false,message:"Quiz not found"});logAudit("admin.quiz.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/feedback",adminAuth,(req,res)=>res.json({success:true,feedback:read(files.feedback,[])}));
app.delete("/api/admin/feedback/:id",adminAuth,(req,res)=>{if(!genericDelete(files.feedback,req.params.id))return res.status(404).json({success:false,message:"Feedback not found"});logAudit("admin.feedback.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/reports",adminAuth,(req,res)=>genericList(files.reports,req,res));
app.put("/api/admin/reports/:id",adminAuth,(req,res)=>{const status=["new","reviewing","resolved","closed"].includes(req.body.status)?req.body.status:"new";const row=genericUpdate(files.reports,req.params.id,{status,adminNote:clean(req.body.adminNote,1000)});if(!row)return res.status(404).json({success:false,message:"Report not found"});logAudit("admin.report.update",req.admin.username,{id:req.params.id,status});res.json({success:true,row});});
app.delete("/api/admin/reports/:id",adminAuth,(req,res)=>{if(!genericDelete(files.reports,req.params.id))return res.status(404).json({success:false,message:"Report not found"});logAudit("admin.report.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/announcements",adminAuth,(req,res)=>genericList(files.announcements,req,res));
app.post("/api/admin/announcements",adminAuth,(req,res)=>{const row=genericCreate(files.announcements,{title:clean(req.body.title,160),message:clean(req.body.message,1000),audience:clean(req.body.audience,40)||"everyone",active:req.body.active!==false});logAudit("admin.announcement.create",req.admin.username,{id:row.id});res.json({success:true,row});});
app.put("/api/admin/announcements/:id",adminAuth,(req,res)=>{const row=genericUpdate(files.announcements,req.params.id,{title:clean(req.body.title,160),message:clean(req.body.message,1000),audience:clean(req.body.audience,40)||"everyone",active:bool(req.body.active)});if(!row)return res.status(404).json({success:false,message:"Announcement not found"});logAudit("admin.announcement.update",req.admin.username,{id:req.params.id});res.json({success:true,row});});
app.delete("/api/admin/announcements/:id",adminAuth,(req,res)=>{if(!genericDelete(files.announcements,req.params.id))return res.status(404).json({success:false,message:"Announcement not found"});logAudit("admin.announcement.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("/api/admin/settings",adminAuth,(_,res)=>res.json({success:true,settings:{...DEFAULT_SETTINGS,...read(files.settings,{})}}));
app.put("/api/admin/settings",adminAuth,(req,res)=>{settings={...DEFAULT_SETTINGS,...settings,...req.body,maintenance:bool(req.body.maintenance)};write(files.settings,settings);logAudit("admin.settings.update",req.admin.username);res.json({success:true,settings});});
app.get("/api/admin/audit",adminAuth,(_,res)=>res.json({success:true,rows:read(files.audit,[]).slice(0,300)}));
app.post("/api/admin/security/change-credentials",adminAuth,(req,res)=>{const current=String(req.body.currentPassword||""),nu=clean(req.body.username,100),np=String(req.body.newPassword||"");admin=setupAdmin();if(!verifyPassword(current,admin.passwordHash))return res.status(401).json({success:false,message:"Current admin password is incorrect."});if(!nu||!validPassword(np))return res.status(400).json({success:false,message:"Username and new password are required; password must be at least 8 characters."});admin={...admin,username:nu,passwordHash:hashPassword(np),updatedAt:now()};write(files.admin,admin);for(const k of adminSessions.keys())adminSessions.delete(k);logAudit("admin.credentials.change",nu);res.json({success:true,message:"Credentials changed. Please log in again."});});
app.get("/api/admin/export",adminAuth,(_,res)=>{res.json({success:true,exportedAt:now(),settings:read(files.settings,{}),users:read(files.users,[]).map(safeUser),scenarios:read(files.scenarios,[]),resources:read(files.resources,[]),quizzes:read(files.quizzes,[]),feedback:read(files.feedback,[]),reports:read(files.reports,[]),certificates:read(files.certificates,[]),announcements:read(files.announcements,[]),audit:read(files.audit,[])});});
app.get("/api/admin/certificates",adminAuth,(_,res)=>res.json({success:true,certificates:read(files.certificates,[]).map(({internalCode,...c})=>c)}));
app.delete("/api/admin/certificates/:id",adminAuth,(req,res)=>{if(!genericDelete(files.certificates,req.params.id))return res.status(404).json({success:false,message:"Certificate not found"});logAudit("admin.certificate.delete",req.admin.username,{id:req.params.id});res.json({success:true});});
app.get("*",(req,res)=>{if(req.path.startsWith("/api/"))return res.status(404).json({success:false,message:"Not found"});res.sendFile(path.join(FRONTEND,"index.html"));});
async function initializeStorage(){
  initLocalFiles();
  if(dbPool){
    await dbPool.query(`CREATE TABLE IF NOT EXISTS safenet_json_store (
      store_key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const result=await dbPool.query("SELECT store_key, value FROM safenet_json_store");
    const saved=new Map(result.rows.map(row=>[row.store_key,row.value]));
    for(const [key,file] of Object.entries(files)){
      if(saved.has(key)){
        fs.writeFileSync(file,JSON.stringify(saved.get(key),null,2));
      }else{
        const initial=read(file,fallbacks[key]);
        await dbPool.query("INSERT INTO safenet_json_store (store_key, value, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (store_key) DO NOTHING",[key,JSON.stringify(initial)]);
      }
    }
    storeReady=true;
    console.log("Persistent PostgreSQL storage connected.");
  } else {
    console.warn("DATABASE_URL is not set: using local JSON files. On cloud hosts with ephemeral storage, records may be lost after restart/redeploy.");
  }
  settings={...DEFAULT_SETTINGS,...read(files.settings,{})};
  admin=setupAdmin();
  await persistenceQueue;
}
initializeStorage().then(()=>{
  app.listen(PORT,()=>console.log(`SafeNet server listening on port ${PORT}`));
}).catch(async err=>{
  console.error("SafeNet startup failed while initializing persistent storage:",err);
  if(dbPool)await dbPool.end().catch(()=>{});
  process.exit(1);
});
