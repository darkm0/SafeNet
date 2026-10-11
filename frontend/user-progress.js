window.SafeNetProgress = (() => {
  const API=(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'http://localhost:5000/api':'/api';
  const tokenKey='safenet_user_token_v17';
  const getToken=()=>sessionStorage.getItem(tokenKey);
  async function sync(extra={}){
    const token=getToken(); if(!token) return null;
    const scenarioIds=[]; try{for(let i=1;i<=500;i++){if(localStorage.getItem('sn-done-'+i))scenarioIds.push(i)}}catch{}
    const r=await fetch(API+'/user/progress',{method:'POST',headers:{'Content-Type':'application/json','x-user-token':token},body:JSON.stringify({...extra,scenarioIds}),cache:'no-store'});
    if(!r.ok) return null; return r.json();
  }
  async function refresh(){
    const token=getToken(); if(!token) return;
    try{const r=await fetch(API+'/user/dashboard',{headers:{'x-user-token':token},cache:'no-store'});if(!r.ok)return;const j=await r.json(),u=j.user,p=u.progress||{};
      const l=document.getElementById('publicProgressLessons'),s=document.getElementById('publicProgressScenarios'),q=document.getElementById('publicProgressQuizzes'),a=document.getElementById('publicProgressUser');
      if(l)l.textContent=(p.lessonsCompleted||[]).length;if(s)s.textContent=(p.scenarioIds||[]).length;if(q)q.textContent=Object.keys(p.quizScores||{}).length;if(a)a.textContent=u.username||'Member';
    }catch{}
  }
  async function markLesson(id){return sync({lessonsCompleted:[...(window.__snLessonsCompleted||[]),Number(id)]});}
  async function syncLocalScenarioProgress(){ const token=getToken(); if(!token)return; const ids=[]; try{for(let i=1;i<=500;i++){if(localStorage.getItem('sn-done-'+i))ids.push(i)}}catch{}; if(!ids.length)return; try{await fetch(API+'/user/progress',{method:'POST',headers:{'Content-Type':'application/json','x-user-token':token},body:JSON.stringify({scenarioIds:ids}),cache:'no-store'});}catch{} }
  document.addEventListener('DOMContentLoaded',async()=>{await syncLocalScenarioProgress();await refresh();});
  return {sync,refresh,markLesson,getToken};
})();
