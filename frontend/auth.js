(() => {
  const API=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'http://localhost:5000/api':'/api';
  const $=id=>document.getElementById(id); const tokenKey='safenet_user_token_v17'; let mode='login';
  const setStatus=(m,ok=false)=>{const e=$('authStatus');e.textContent=m;e.style.color=ok?'#2d6b4d':'#9b473c';};
  async function request(path,opts={}){const headers={'Content-Type':'application/json',...(opts.headers||{})};const t=sessionStorage.getItem(tokenKey);if(t)headers['x-user-token']=t;const r=await fetch(API+path,{...opts,headers,cache:'no-store'});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.message||`Request failed (${r.status})`);return j;}
  function setMode(next){mode=next;$('loginFields').hidden=next!=='login';$('registerFields').hidden=next!=='register';document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===next));$('authSubmit').textContent=next==='login'?'Login & Continue →':'Create Account & Continue →';setStatus('');}
  async function boot(){try{const j=await request('/auth/me');if(j.user){location.replace('dashboard.html');return;}}catch{}setMode('login');}
  $('tabs').addEventListener('click',e=>{const b=e.target.closest('.auth-tab');if(b)setMode(b.dataset.mode)});
  $('authForm').addEventListener('submit',async e=>{e.preventDefault();try{setStatus(mode==='login'?'Checking your account…':'Creating your secure account…');const f=new FormData(e.currentTarget),payload=Object.fromEntries(f.entries());const j=await request(mode==="login"?'/auth/login':'/auth/register',{method:'POST',body:JSON.stringify(mode==='login'?{identifier:payload.identifier,password:payload.password}:{name:payload.name,email:payload.email,username:payload.username,password:payload.password,type:payload.type,classLevel:payload.classLevel,city:payload.city})});sessionStorage.setItem(tokenKey,j.token);setStatus('Success. Opening your dashboard…',true);setTimeout(()=>location.replace('dashboard.html'),250);}catch(err){setStatus(err.message);}});
  $('logoutHome').addEventListener('click',()=>sessionStorage.removeItem(tokenKey));boot();
})();
