(() => {
  const key = 'work-partner-v1';
  const recoveryKey = 'work-partner-recovery-v1';
  const backupNoticeKey = 'work-partner-backup-notice-v1';
  const now = new Date();
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>(crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const isoDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const todayStr=isoDate(now);
  let mode='monthly';
  let dailyShown=todayStr;
  let domReady=false;
  let deadlineSnoozed=false;
  const termOrigin=17;
  const termOriginYear=2026;
  function fiscalFromDate(dateStr){
    if(!/^\d{4}-\d{2}/.test(dateStr||'')) return null;
    const [year,month]=String(dateStr).split('-').map(Number);
    if(!year||!month) return null;
    const anchor=month>=4?year:year-1;
    const number=termOrigin+(anchor-termOriginYear);
    const half=month>=4&&month<=9?'H1':'H2';
    return {number,half,key:`${number}-${half}`};
  }
  function currentHalfKey(){return fiscalFromDate(isoDate(now)).key}
  function halfFromDate(dateStr){return fiscalFromDate(dateStr)?.key||''}
  function canonicalPeriod(raw){
    const text=String(raw||'');
    const term=text.match(/^(\d{1,2})-H([12])$/);
    if(term) return `${Number(term[1])}-H${term[2]}`;
    const old=text.match(/^(\d{4})-H([12])$/);
    if(!old) return '';
    return fiscalFromDate(`${old[1]}-${old[2]==='1'?'06':'10'}-01`).key;
  }
  function parseHalf(key){
    const canon=canonicalPeriod(key)||currentHalfKey();
    const matched=canon.match(/^(\d+)-H([12])$/);
    return {number:Number(matched[1]),half:matched[2]==='1'?'H1':'H2',key:canon};
  }
  function halfLabel(key){const p=parseHalf(key);return `${p.number}期${p.half==='H1'?'上期':'下期'}`}
  function halfRangeLabel(key){
    const p=parseHalf(key);
    const startYear=termOriginYear+(p.number-termOrigin);
    return p.half==='H1'?`${startYear}年4月〜${startYear}年9月`:`${startYear}年10月〜${startYear+1}年3月`;
  }
  function missionPeriodOf(m){return canonicalPeriod(m?.period)||halfFromDate(m?.due)||currentHalfKey()}
  let missionHalf=currentHalfKey();

  function normalize(raw){
    const s=raw && typeof raw==='object' ? raw : {};
    const monthlyItems=Array.isArray(s.monthlyItems)?s.monthlyItems:Object.values(s.monthlyItems||{}).filter(x=>typeof x==='string');
    const weeklyItems=Array.isArray(s.weeklyItems)?s.weeklyItems:Object.values(s.weeklyItems||{}).filter(x=>typeof x==='string');
    const monthly=s.monthly && typeof s.monthly==='object' && !Array.isArray(s.monthly) ? s.monthly : {};
    let weekly=s.weekly;
    if(!Array.isArray(weekly)) weekly=Object.values(weekly||{}).filter(x=>x && typeof x==='object');
    Object.values(monthly).forEach(record=>{
      if(record && typeof record==='object' && record.answers && Object.keys(record.answers).length && !Array.isArray(record.items)) record.items=[...monthlyItems];
    });
    const missions=Array.isArray(s.missions)?s.missions.map(m=>({
      id:m?.id||uid(),
      title:m?.title||'',
      response:m?.response||'',
      due:m?.due||'',
      period:canonicalPeriod(m?.period)||halfFromDate(m?.due)||(Array.isArray(m?.tasks)?halfFromDate(m.tasks.map(t=>t?.due).find(Boolean)):'')||currentHalfKey(),
      tasks:Array.isArray(m?.tasks)?m.tasks.map(t=>({
        id:t?.id||uid(),
        title:t?.title||'',
        due:t?.due||'',
        status:t?.status==='doing'||t?.status==='done'?t.status:'todo'
      })) : []
    })) : [];
    const daily=s.daily && typeof s.daily==='object' && !Array.isArray(s.daily) ? s.daily : {};
    Object.keys(daily).forEach(date=>{
      const rec=daily[date];
      if(!rec || typeof rec!=='object'){ delete daily[date]; return; }
      rec.tasks=Array.isArray(rec.tasks)?rec.tasks.map(t=>({
        id:t?.id||uid(),
        title:t?.title||'',
        status:t?.status==='doing'||t?.status==='done'?t.status:'todo'
      })) : [];
      rec.reflection=rec.reflection||'';
    });
    const learnings=Array.isArray(s.learnings)?s.learnings.filter(p=>p && typeof p==='object').map(p=>({
      id:p.id||uid(),
      date:p.date||'',
      text:p.text||'',
      createdAt:p.createdAt||new Date().toISOString()
    })) : [];
    return {monthlyItems,weeklyItems,monthly,weekly,missions,daily,learnings,dismissedAlerts:Array.isArray(s.dismissedAlerts)?s.dismissedAlerts:[]};
  }

  let state;
  try{
    const saved=localStorage.getItem(key)||localStorage.getItem(recoveryKey)||localStorage.getItem('omamori-reflection-v1')||localStorage.getItem('omamori-reflection-recovery-v1');
    state=normalize(saved?JSON.parse(saved):{});
  }catch{state=normalize({})}

  function saveState(){
    const serialized=JSON.stringify(state);
    localStorage.setItem(recoveryKey,serialized);
    localStorage.setItem(key,serialized);
  }
  function toast(msg){
    $('#toast').textContent=msg;
    $('#toast').classList.add('show');
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>$('#toast').classList.remove('show'),2200);
  }
  function backupNoticeMonth(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  function isMonthEnd(){const d=new Date();const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return d.getDate()>=last-2}
  function closeBackupNotice(){localStorage.setItem(backupNoticeKey,backupNoticeMonth());$('#backupNotice').classList.add('hidden')}
  function showBackupNotice(){const hidden=!isMonthEnd()||localStorage.getItem(backupNoticeKey)===backupNoticeMonth();$('#backupNotice').classList.toggle('hidden',hidden)}
  function monthName(m){if(!m)return '—';const [y,n]=m.split('-');return `${y}年${Number(n)}月`}
  function dayName(date){if(!date||date.length<10)return '—';const [y,m,d]=date.split('-');return `${y}年${Number(m)}月${Number(d)}日`}
  function weekKey(date){
    const d=new Date(date+'T00:00:00');
    const day=d.getDay()||7;
    d.setDate(d.getDate()-day+1);
    return isoDate(d);
  }
  function daysUntil(dateStr){
    if(!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const target=new Date(dateStr+'T00:00:00');
    const today=new Date();
    today.setHours(0,0,0,0);
    return Math.round((target.getTime()-today.getTime())/86400000);
  }
  function progressOf(tasks){
    const list=tasks||[];
    const total=list.length;
    const done=list.filter(t=>t.status==='done').length;
    return {total,done,pct:total?Math.round(done/total*100):0};
  }
  function statusChoice(name,idPrefix,status){
    const opts=[['todo','未着手','todo'],['doing','進行中','doing'],['done','完了','yes']];
    return `<div class="choice">${opts.map(([value,label,cls])=>`<input type="radio" name="${esc(name)}" id="${esc(idPrefix)}-${value}" value="${value}" ${status===value?'checked':''}><label class="${cls}" for="${esc(idPrefix)}-${value}">${label}</label>`).join('')}</div>`;
  }
  function setPage(id){
    commitOpenForms();
    saveState();
    $$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
    $$('.page').forEach(p=>p.classList.toggle('active',p.id===id));
    document.querySelector(`nav button[data-page="${id}"]`)?.scrollIntoView({inline:'nearest',block:'nearest'});
    if(id==='home') renderHome();
    if(id==='report') renderReport();
    if(id==='mission') renderMissions();
    if(id==='daily') renderDaily();
    if(id==='learn') renderLearnings();
  }
  function score(record,items){
    const scopedItems=Array.isArray(record?.items)?record.items:items;
    if(!record||!scopedItems.length||!record.answers||!Object.keys(record.answers).length) return null;
    const answers=record.answers;
    return Math.round(scopedItems.reduce((n,_,i)=>n+(answers[i]==='yes'?1:0),0)/scopedItems.length*100);
  }
  function recordFor(){
    if(mode==='monthly') return state.monthly[$('#formPeriod').value]||{};
    return state.weekly.find(x=>x.week===weekKey($('#formPeriod').value))||{};
  }
  function monthlyItemsFor(period){
    const record=state.monthly[period];
    return Array.isArray(record?.items)?record.items:state.monthlyItems;
  }
  function monthlySettingsPeriod(){return $('#formPeriod').type==='month'?($('#formPeriod').value||current):($('#homeMonth').value||current)}
  function editableMonthlyItems(){
    const period=monthlySettingsPeriod();
    const record=state.monthly[period]||{};
    if(!Array.isArray(record.items)) state.monthly[period]={...record,items:[...state.monthlyItems]};
    return state.monthly[period].items;
  }
  function syncMonthlyDefaults(period,items){if(period>=current) state.monthlyItems=[...items]}
  function commitMissionsFromDom(){
    if(!domReady || !$('#missionList')) return;
    const cards=[...document.querySelectorAll('#missionList .mission-card')];
    if(!cards.length) return;
    const current=cards.map(card=>({
      id:card.dataset.mid,
      title:card.querySelector('.mission-title').value,
      response:card.querySelector('.mission-response').value,
      due:card.querySelector('.mission-due').value,
      period:card.querySelector('.mission-period')?.value||missionHalf,
      tasks:[...card.querySelectorAll('.task-row')].map(row=>({
        id:row.dataset.id,
        title:row.querySelector('.task-name').value,
        due:row.querySelector('.task-due').value,
        status:row.querySelector('input[type="radio"]:checked')?.value||'todo'
      }))
    }));
    const ids=new Set(current.map(m=>m.id));
    state.missions=[...current,...state.missions.filter(m=>missionPeriodOf(m)!==missionHalf && !ids.has(m.id))];
  }
  function commitDailyFromDom(){
    if(!domReady || !$('#dailyTasks')) return;
    if(!dailyShown) return;
    state.daily[dailyShown]={
      tasks:[...document.querySelectorAll('#dailyTasks .check-row')].map(row=>({
        id:row.dataset.id,
        title:row.querySelector('.task-name').value,
        status:row.querySelector('input[type="radio"]:checked')?.value||'todo'
      })),
      reflection:$('#dailyReflection').value
    };
  }
  function commitCheckFromDom(){
    if(!domReady || !$('#formPeriod') || !$('#reflectionInput')) return;
    const period=$('#formPeriod').value;
    if(!period) return;
    if(mode==='monthly'){
      const items=monthlyItemsFor(period);
      const answers={};
      items.forEach((_,i)=>{const v=document.querySelector(`input[name="check-${i}"]:checked`)?.value;if(v)answers[i]=v});
      const prev=state.monthly[period]||{};
      state.monthly[period]={...prev,answers,reflection:$('#reflectionInput').value,theme:$('#themeInput').value,items:[...(Array.isArray(prev.items)?prev.items:items)]};
      return;
    }
    const items=state.weeklyItems;
    const answers={};
    items.forEach((_,i)=>{const v=document.querySelector(`input[name="check-${i}"]:checked`)?.value;if(v)answers[i]=v});
    const wk=weekKey(period);
    const data={week:wk,answers,reflection:$('#reflectionInput').value};
    const idx=state.weekly.findIndex(x=>x.week===wk);
    if(idx>=0) state.weekly[idx]={...state.weekly[idx],...data};
    else if(items.length||data.reflection) state.weekly.push(data);
  }
  function commitMottoFromDom(){
    const editor=$('#mottoEditor');
    if(!editor || editor.classList.contains('hidden')) return;
    const m=$('#homeMonth').value;
    if(!m) return;
    state.monthly[m]={...(state.monthly[m]||{}),motto:$('#mottoInput').value};
  }
  function commitOpenForms(){commitMissionsFromDom();commitDailyFromDom();commitCheckFromDom();commitMottoFromDom()}
  function persist(options){if(!options || options.commit!==false) commitOpenForms();saveState();renderAll()}
  function renderSettings(){
    const render=type=>{
      const list=type==='monthly'?monthlyItemsFor(monthlySettingsPeriod()):state.weeklyItems;
      $('#'+type+'Items').innerHTML=list.length?list.map((x,i)=>`<div class="item-line"><span>${esc(x)}</span><button type="button" class="delete" title="削除" data-delete="${type}" data-index="${i}">×</button></div>`).join(''):'<div class="note">まだ項目がありません</div>';
    };
    render('monthly');render('weekly');
    $('#weeklyTab').disabled=!state.weeklyItems.length;
    $('#weeklyHint').textContent=state.weeklyItems.length?'週次チェックを利用できます。':'項目を1つ追加すると週次タブを使えます。';
  }
  function renderForm(){
    const monthly=mode==='monthly';
    const r=recordFor();
    const items=monthly?monthlyItemsFor($('#formPeriod').value):state.weeklyItems;
    $('#formTitle').textContent=monthly?'月次チェック':'週次チェック';
    $('#monthlyTab').classList.toggle('active',monthly);
    $('#weeklyTab').classList.toggle('active',!monthly);
    $('#themeEditor').classList.toggle('hidden',!monthly);
    if(monthly) $('#themeInput').value=r.theme||'';
    $('#reflectionInput').value=r.reflection||'';
    $('#checkList').innerHTML=items.length?items.map((item,i)=>`<div class="check-row"><label>${esc(item)}</label><div class="choice"><input type="radio" name="check-${i}" id="yes-${i}" value="yes" ${r.answers?.[i]==='yes'?'checked':''}><label class="yes" for="yes-${i}">できた</label><input type="radio" name="check-${i}" id="no-${i}" value="no" ${r.answers?.[i]==='no'?'checked':''}><label class="no" for="no-${i}">できてない</label></div></div>`).join(''):'<div class="empty">右の「項目の設定」から、最初のチェック項目を追加してください。</div>';
  }
  function chartData(){
    const result=[];
    for(let off=5;off>=0;off--){
      const d=new Date(now.getFullYear(),now.getMonth()-off,1);
      const m=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      result.push({m,s:score(state.monthly[m],state.monthlyItems)});
    }
    return result;
  }
  function renderChart(){
    const data=chartData(),w=560,h=210,p=28;
    const pts=data.map((d,i)=>({x:p+i*(w-p*2)/5,y:d.s===null?null:h-p-(d.s/100)*(h-p*2)}));
    const valid=pts.filter(pt=>pt.y!==null);
    const line=valid.map(pt=>`${pt.x},${pt.y}`).join(' ');
    const area=line?`${p},${h-p} ${line} ${valid.at(-1).x},${h-p}`:'';
    const grids=[0,50,100].map(v=>{const y=h-p-(v/100)*(h-p*2);return `<line class="gridline" x1="${p}" x2="${w-p}" y1="${y}" y2="${y}"/><text class="chart-label" x="1" y="${y+4}">${v}%</text>`}).join('');
    const dots=pts.map((pt,i)=>{
      const label=`<text class="chart-label" text-anchor="middle" x="${pt.x}" y="${h-5}">${Number(data[i].m.slice(5))}月</text>`;
      return pt.y!==null?`<circle class="chart-dot" cx="${pt.x}" cy="${pt.y}" r="4"/>${label}`:label;
    }).join('');
    const shape=area?`<polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${line}"/>`:'';
    $('#chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="月ごとの達成率グラフ"><defs><linearGradient id="grad" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7dcee6"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>${grids}${shape}${dots}</svg>`;
  }
  function renderHome(){
    const m=$('#homeMonth').value;
    $('#homeTitle').textContent=`${monthName(m)}の振り返り`;
    const r=state.monthly[m]||{};
    const monthItems=monthlyItemsFor(m);
    const sc=score(r,monthItems);
    $('#themeView').innerHTML=r.theme?esc(r.theme):'<span class="empty-theme">まだテーマがありません。今月、何を試して・育てる？</span>';
    $('#mottoView').textContent=r.motto||'今月、心にとどめたい言葉を残そう';
    $('#mottoView').classList.toggle('empty-motto',!r.motto);
    $('#mottoInput').value=r.motto||'';
    $('#monthRing').style.setProperty('--value',sc??0);
    $('#monthScore').innerHTML=`${sc??'—'}<small>達成率</small>`;
    $('#monthDetail').textContent=sc===null?'項目を設定すると点数が出ます':`${monthItems.length}項目中 ${Object.values(r.answers||{}).filter(x=>x==='yes').length}項目できた`;
    const halfKey=halfFromDate(`${m}-01`)||currentHalfKey();
    const halfMissions=state.missions.filter(item=>missionPeriodOf(item)===halfKey && missionHasContent(item));
    const halfTasks=halfMissions.flatMap(item=>item.tasks||[]);
    const halfP=progressOf(halfTasks);
    $('#homeMissionScore').textContent=halfP.total?`${halfP.pct}%`:halfMissions.length?`${halfMissions.length}件`:'—';
    $('#homeMissionDetail').textContent=halfMissions.length?`${halfLabel(halfKey)}・${halfMissions.length}件・タスク ${halfP.done}/${halfP.total}`:`${halfLabel(halfKey)}のミッションはまだありません`;
    const monthDays=Object.entries(state.daily).filter(([date,rec])=>date.startsWith(m)&&rec&&((rec.tasks||[]).length||String(rec.reflection||'').trim()));
    const dailyTasks=monthDays.flatMap(([,rec])=>rec.tasks||[]);
    const dailyP=progressOf(dailyTasks);
    $('#homeDailyScore').textContent=dailyP.total?`${dailyP.pct}%`:monthDays.length?`${monthDays.length}日`:'—';
    $('#homeDailyDetail').textContent=monthDays.length?`${monthDays.length}日・${dailyP.done}/${dailyP.total}完了`:'この月の日時タスクはまだありません';
    const monthPosts=state.learnings.filter(post=>(post.date||'').startsWith(m));
    const learnDays=new Set(monthPosts.map(post=>post.date)).size;
    $('#homeLearnScore').textContent=monthPosts.length?`${learnDays}日`:'—';
    $('#homeLearnDetail').textContent=monthPosts.length?`${learnDays}日・${monthPosts.length}件`:'この月の学びはまだありません';
    renderChart();
    const months=chartData();
    $('#tracker').innerHTML=months.map(({m:month,s})=>{
      const weekly=state.weekly.some(x=>x.week.startsWith(month));
      const status=s!==null?'done':weekly?'partial':'';
      return `<div class="track-month"><div class="track-dot ${status}">${s!==null?'✓':weekly?'•':'—'}</div>${Number(month.slice(5))}月</div>`;
    }).join('');
  }
  function statusBadge(status){
    const label=status==='done'?'完了':status==='doing'?'進行中':'未着手';
    const cls=status==='done'?'yes':status==='doing'?'doing':'todo';
    return `<span class="badge ${cls}">${label}</span>`;
  }
  function weekday(date){return '日月火水木金土'[new Date(date+'T00:00:00').getDay()]||''}
  function missionTouchesMonth(m,month){
    if((m.due||'').startsWith(month)) return true;
    if((m.tasks||[]).some(t=>(t.due||'').startsWith(month))) return true;
    return !m.due && (m.tasks||[]).every(t=>!t.due) && month===current && missionPeriodOf(m)===halfFromDate(current+'-01');
  }
  function monthSnapshot(month){
    const monthly=state.monthly[month]||{};
    const items=monthlyItemsFor(month);
    const sc=score(monthly,items);
    const yes=Object.values(monthly.answers||{}).filter(x=>x==='yes').length;
    const missions=state.missions.filter(m=>missionTouchesMonth(m,month)).map(m=>({...m,tasks:[...(m.tasks||[])],progress:progressOf(m.tasks)}));
    const missionP=progressOf(missions.flatMap(m=>m.tasks));
    const days=Object.entries(state.daily).filter(([date,rec])=>date.startsWith(month)&&rec&&((rec.tasks||[]).length||String(rec.reflection||'').trim())).sort(([a],[b])=>a.localeCompare(b)).map(([date,rec])=>({date,tasks:rec.tasks||[],reflection:rec.reflection||'',progress:progressOf(rec.tasks||[])}));
    const dailyP=progressOf(days.flatMap(d=>d.tasks));
    const posts=state.learnings.filter(p=>(p.date||'').startsWith(month)).slice().sort((a,b)=>a.date===b.date?String(a.createdAt).localeCompare(String(b.createdAt)):a.date.localeCompare(b.date));
    const learnDays=new Set(posts.map(p=>p.date)).size;
    return {month,monthly,items,sc,yes,missions,missionP,days,dailyP,posts,learnDays};
  }
  function reportHtml(s){
    const m=s.month;
    const checkDetail=s.sc===null?'未入力':`${s.items.length}項目中 ${s.yes}できた`;
    const missionDetail=s.missions.length?`${s.missions.length}件・タスク ${s.missionP.done}/${s.missionP.total}`:'この月の記録なし';
    const dailyDetail=s.days.length?`${s.days.length}日・${s.dailyP.done}/${s.dailyP.total}完了`:'この月の記録なし';
    const learnDetail=s.posts.length?`${s.learnDays}日・${s.posts.length}件`:'この月の記録なし';
    const kpis=`<div class="report-kpis"><article><span>月次チェック</span><strong>${s.sc===null?'—':s.sc+'%'}</strong><small>${checkDetail}</small></article><article><span>ミッション</span><strong>${s.missionP.total?s.missionP.pct+'%':'—'}</strong><small>${missionDetail}</small></article><article><span>日時タスク</span><strong>${s.dailyP.total?s.dailyP.pct+'%':'—'}</strong><small>${dailyDetail}</small></article><article><span>学び</span><strong>${s.posts.length?s.learnDays+'日':'—'}</strong><small>${learnDetail}</small></article></div>`;
    const checks=s.items.length?`<table class="result-table"><thead><tr><th>項目</th><th>結果</th></tr></thead><tbody>${s.items.map((x,i)=>`<tr><td>${esc(x)}</td><td>${s.monthly.answers?.[i]?`<span class="badge ${s.monthly.answers[i]}">${s.monthly.answers[i]==='yes'?'できた':'できてない'}</span>`:'未回答'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">月次チェック項目がありません。</div>';
    const missions=s.missions.length?s.missions.map(mission=>{
      const open=mission.tasks.filter(t=>t.status!=='done');
      const due=mission.due?dayName(mission.due):'期日未設定';
      const rows=mission.tasks.length?mission.tasks.map(t=>`<tr class="${t.status==='done'?'':'row-open'}"><td>${esc(t.title||'無題のタスク')}</td><td>${statusBadge(t.status)}</td><td>${t.due?dayName(t.due):'—'}</td></tr>`).join(''):`<tr><td colspan="3">タスクはまだありません</td></tr>`;
      return `<section class="report-mission"><div class="report-mission-head"><div><h3>${esc(mission.title||'無題のミッション')}</h3><p>${esc(due)}${open.length?`・未完了 ${open.length}件`:mission.tasks.length?'・すべて完了':''}</p></div><div class="report-mission-score"><strong>${mission.progress.total?mission.progress.pct+'%':'—'}</strong><div class="bar"><i style="width:${mission.progress.pct}%"></i></div></div></div>${mission.response?`<p class="report-response">${esc(mission.response)}</p>`:''}<table class="result-table"><thead><tr><th>タスク</th><th>状態</th><th>期日</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join(''):'<div class="empty">この月に期日のあるミッションはありません。期日未設定のミッションは、その半期のうち今月のまとめにだけ出ます。</div>';
    const daily=s.days.length?`<table class="result-table"><thead><tr><th>日</th><th>進捗</th><th>タスク</th><th>振り返り</th></tr></thead><tbody>${s.days.map(d=>{
      const names=d.tasks.map(t=>`${t.status==='done'?'✓':'・'}${esc(t.title||'無題')}`).join('<br>')||'—';
      return `<tr class="${d.progress.total&&d.progress.done===d.progress.total?'':'row-open'}"><td>${Number(d.date.slice(5,7))}月${Number(d.date.slice(8))}日（${weekday(d.date)}）</td><td>${d.progress.total?`${d.progress.done}/${d.progress.total}`:'—'}</td><td>${names}</td><td class="report-memo">${esc(d.reflection||'—')}</td></tr>`;
    }).join('')}</tbody></table>`:'<div class="empty">この月の日時タスクはありません。</div>';
    const learn=s.posts.length?s.posts.map(p=>`<article class="learn-post"><div class="learn-post-head"><time>${dayName(p.date)}</time></div><p>${esc(p.text)}</p></article>`).join(''):'<div class="empty">この月の学び記録はありません。</div>';
    return `<div class="report-title"><p class="eyebrow">MONTHLY REVIEW REPORT</p><h1>${monthName(m)} 振り返りレポート</h1><div class="report-meta"><dt>今月のテーマ</dt><dd>${esc(s.monthly.theme||'未設定')}</dd></div></div>${kpis}<section class="report-block"><h2>月次チェック</h2>${checks}<h3>振り返りメモ</h3><div class="reflection-report">${esc(s.monthly.reflection||'まだ記録がありません。')}</div></section><section class="report-block"><h2>ミッション</h2><p class="note">未完了の行を色付きにしています。達成率は、完了タスク ÷ そのミッションのタスク数です。</p>${missions}</section><section class="report-block"><h2>日時タスク</h2><p class="note">記録のある日を、月初から順に並べています。</p>${daily}</section><section class="report-block"><h2>学び記録</h2>${learn}</section>`;
  }
  function renderReport(){$('#reportSheet').innerHTML=reportHtml(monthSnapshot($('#reportMonth').value))}
  function missionTaskRow(t){
    return `<div class="task-row" data-id="${esc(t.id)}"><input class="task-name" value="${esc(t.title)}" placeholder="タスク名" aria-label="タスク名"><input class="task-due form-date" type="date" value="${esc(t.due)}" aria-label="タスクの期日">${statusChoice('m-'+t.id,'m-'+t.id,t.status)}<button type="button" class="delete" data-action="delete-task" data-id="${esc(t.id)}" title="タスクを削除">×</button></div>`;
  }
  function missionCard(m){
    const p=progressOf(m.tasks);
    const label=p.total?`<span>${p.done} / ${p.total} 完了</span><span>${p.pct}%</span>`:'<span>タスクを追加すると進捗が出ます</span><span>—</span>';
    const period=missionPeriodOf(m);
    const options=periodChoices().map(key=>`<option value="${key}" ${key===period?'selected':''}>${halfLabel(key)}</option>`).join('');
    return `<article class="card mission-card" data-mid="${esc(m.id)}"><div class="mission-head"><h2>${esc(m.title)||'新しいミッション'}</h2><button type="button" class="ghost" data-action="delete-mission" data-id="${esc(m.id)}">削除</button></div><label class="field"><span>期</span><select class="mission-period form-date" aria-label="ミッションの期">${options}</select></label><label class="field"><span>ミッション名</span><input class="mission-title" value="${esc(m.title)}" placeholder="例：問い合わせ対応を当日中に返す"></label><label class="field"><span>対応内容</span><textarea class="mission-response" placeholder="何に対して、どこまで、どのように対応するかを書く">${esc(m.response)}</textarea></label><label class="field"><span>ミッションの期日</span><input class="mission-due form-date" type="date" value="${esc(m.due)}"></label><h3>タスク分解</h3><div class="check-list">${m.tasks.length?m.tasks.map(missionTaskRow).join(''):'<div class="empty">内容をタスクに分けると、進捗が見えるようになります。</div>'}</div><div class="add-row"><input class="new-task" placeholder="例：原因を切り分ける"><button type="button" class="small-button primary" data-action="add-task">タスクを追加</button></div><div class="bar-label">${label}</div><div class="bar" role="img" aria-label="タスク進捗 ${p.pct}%"><i style="width:${p.pct}%"></i></div></article>`;
  }
  function missionHasContent(m){
    if((m.title||'').trim()||(m.response||'').trim()||m.due) return true;
    return (m.tasks||[]).some(t=>(t.title||'').trim()||t.due||t.status==='doing'||t.status==='done');
  }
  function renderMissionSummary(){
    const root=$('#missionSummary');
    if(!root) return;
    const missions=state.missions.filter(m=>missionPeriodOf(m)===missionHalf && missionHasContent(m));
    const halfName=halfLabel(missionHalf);
    const tasks=missions.flatMap(m=>m.tasks||[]);
    const p=progressOf(tasks);
    const doing=tasks.filter(t=>t.status==='doing').length;
    const finished=missions.filter(m=>(m.tasks||[]).length>0 && m.tasks.every(t=>t.status==='done')).length;
    if(!missions.length){
      root.innerHTML=`<article class="card mission-overview"><div><h2>${esc(halfName)}の進捗</h2><p class="note">${esc(halfRangeLabel(missionHalf))}のミッションを追加すると、件数とタスク全体の達成率がここに出ます。</p></div></article>`;
      return;
    }
    const jumps=missions.map(m=>{
      const mp=progressOf(m.tasks);
      return `<button type="button" class="mission-jump" data-mid="${esc(m.id)}"><b>${esc(m.title||'新しいミッション')}</b><em>${mp.total?`${mp.done}/${mp.total}`:'タスクなし'}</em><span class="bar" aria-hidden="true"><i style="width:${mp.pct}%"></i></span></button>`;
    }).join('');
    root.innerHTML=`<article class="card mission-overview"><div class="daily-score"><div class="ring" id="missionRing" style="--value:${p.pct}"><span>${p.total?p.pct:'—'}<small>${parseHalf(missionHalf).half==='H1'?'上期':'下期'}</small></span></div><div class="score-label">${esc(halfName)}の達成率</div></div><div><div class="mission-overview-stats"><div><strong>${missions.length}</strong><span>ミッション</span></div><div><strong>${finished}</strong><span>完了</span></div><div><strong>${p.done}/${p.total||0}</strong><span>タスク完了</span></div><div><strong>${doing}</strong><span>進行中</span></div></div><div class="bar-label"><span>${esc(halfName)}のすべて</span><span>${p.total?p.pct+'%':'—'}</span></div><div class="bar" role="img" aria-label="${esc(halfName)}のタスク進捗 ${p.pct}%"><i style="width:${p.pct}%"></i></div><div class="mission-jumps">${jumps}</div></div></article>`;
  }
  function comparePeriod(a,b){
    const pa=parseHalf(a),pb=parseHalf(b);
    return pa.number-pb.number||(pa.half===pb.half?0:pa.half==='H1'?-1:1);
  }
  function periodChoices(){
    const keys=[];
    for(let number=termOrigin;number<=termOrigin+5;number++){
      if(number!==termOrigin) keys.push(`${number}-H1`);
      keys.push(`${number}-H2`);
    }
    state.missions.forEach(m=>{const key=missionPeriodOf(m);if(!keys.includes(key)) keys.push(key)});
    return keys.sort(comparePeriod);
  }
  function halfTabKeys(){
    return [...new Set(state.missions.map(m=>missionPeriodOf(m)))].sort(comparePeriod);
  }
  function updateHalfControl(){
    const keys=halfTabKeys();
    const selected=parseHalf(missionHalf).key;
    const root=$('#missionHalfTabs');
    root.innerHTML=keys.map(key=>{
      const active=key===selected;
      return `<button type="button" role="tab" data-half-key="${key}" aria-selected="${active}" class="${active?'active':''}">${halfLabel(key)}</button>`;
    }).join('');
    root.hidden=!keys.length;
    $('#missionHalfRange').textContent=keys.includes(selected)?`${halfLabel(selected)}は${halfRangeLabel(selected)}です。同じ期のミッションが、このタブに並びます。`:'';
    root.querySelector('.active')?.scrollIntoView({inline:'nearest',block:'nearest'});
  }
  function visibleMissions(){return state.missions.filter(m=>missionPeriodOf(m)===missionHalf)}
  function renderMissions(){
    const keys=halfTabKeys();
    if(keys.length && !keys.includes(parseHalf(missionHalf).key)) missionHalf=keys[0];
    updateHalfControl();
    const root=$('#missionList');
    const missions=visibleMissions();
    if(!missions.length){
      $('#missionSummary').innerHTML='';
      root.innerHTML='<div class="empty">ミッションを追加して期を選ぶと、その期のタブができます。同じ期のミッションは、そのタブの中に並びます。</div>';
      return;
    }
    renderMissionSummary();
    root.innerHTML=missions.map(missionCard).join('');
  }
  function setMissionHalf(key){
    commitMissionsFromDom();
    missionHalf=parseHalf(key).key;
    saveState();
    renderMissions();
  }
  function paintMissionProgress(card){
    if(!card) return;
    const tasks=[...card.querySelectorAll('.task-row')].map(row=>({status:row.querySelector('input[type="radio"]:checked')?.value||'todo'}));
    const p=progressOf(tasks);
    const label=card.querySelector('.bar-label');
    const bar=card.querySelector('.bar i');
    if(label) label.innerHTML=p.total?`<span>${p.done} / ${p.total} 完了</span><span>${p.pct}%</span>`:'<span>タスクを追加すると進捗が出ます</span><span>—</span>';
    if(bar) bar.style.width=p.pct+'%';
  }
  function paintDailyProgress(){
    const tasks=[...document.querySelectorAll('#dailyTasks .check-row')].map(row=>({status:row.querySelector('input[type="radio"]:checked')?.value||'todo'}));
    const p=progressOf(tasks);
    const label=$('#dailyBarLabel');
    if(label) label.innerHTML=p.total?`<span>${p.done} / ${p.total} 完了</span><span>${p.pct}%</span>`:'<span>タスクを追加すると進捗が出ます</span><span>—</span>';
    const bar=$('#dailyBar');
    if(bar) bar.style.width=p.pct+'%';
    $('#dailyRing').style.setProperty('--value',String(p.pct));
    $('#dailyScore').innerHTML=`${p.total?p.pct:'—'}<small>達成率</small>`;
    $('#dailyDetail').textContent=p.total?`${p.total}件中 ${p.done}件完了`:'タスクを追加すると進捗が出ます';
  }
  function renderDaily(){
    const rec=state.daily[dailyShown]||{tasks:[],reflection:''};
    const tasks=Array.isArray(rec.tasks)?rec.tasks:[];
    $('#dailyTasks').innerHTML=tasks.length?tasks.map(t=>`<div class="check-row" data-id="${esc(t.id)}"><input class="task-name" value="${esc(t.title)}" aria-label="タスク名"><div class="daily-actions">${statusChoice('d-'+t.id,'d-'+t.id,t.status)}<button type="button" class="delete" data-action="delete-daily" data-id="${esc(t.id)}" title="削除">×</button></div></div>`).join(''):'<div class="empty">この日のタスクを追加してください。</div>';
    $('#dailyReflection').value=rec.reflection||'';
    paintDailyProgress();
  }
  function renderLearnCalendar(){
    const month=$('#learnMonth').value;
    const selected=$('#learnDate').value;
    if(!month) return;
    const [year,mon]=month.split('-').map(Number);
    const first=new Date(year,mon-1,1).getDay();
    const last=new Date(year,mon,0).getDate();
    const counts={};
    state.learnings.forEach(p=>{if(p.date) counts[p.date]=(counts[p.date]||0)+1});
    let cells='';
    for(let i=0;i<first;i++) cells+='<div class="calendar-day empty-day"></div>';
    for(let day=1;day<=last;day++){
      const date=`${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const classes=['calendar-day'];
      if(date===todayStr) classes.push('today');
      if(date===selected) classes.push('selected');
      if((first+day-1)%7===0) classes.push('sunday');
      if(counts[date]) classes.push('has-post');
      const mark=counts[date]?`<span class="calendar-marks"><b class="mark-week" title="投稿 ${counts[date]}件">${counts[date]}</b></span>`:'';
      cells+=`<button type="button" class="${classes.join(' ')}" data-date="${date}"><span>${day}</span>${mark}</button>`;
    }
    $('#learnCalendar').innerHTML=cells;
    const posted=new Set(state.learnings.filter(p=>p.date&&p.date.startsWith(month)).map(p=>p.date)).size;
    $('#learnTrackNote').textContent=posted?`${monthName(month)}は ${posted}日、投稿があります。`:'この月の投稿はまだありません。投稿すると、その日に色がつきます。';
  }
  function renderLearnList(){
    const date=$('#learnDate').value;
    $('#learnListTitle').textContent=`${dayName(date)}の記録`;
    const posts=state.learnings.filter(p=>p.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    $('#learnList').innerHTML=posts.length?posts.map(p=>{
      const time=new Date(p.createdAt);
      const stamp=Number.isNaN(time.getTime())?'':time.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
      return `<article class="learn-post"><div class="learn-post-head"><time>${esc(stamp)}</time><button type="button" class="delete" data-action="delete-learn" data-id="${esc(p.id)}" title="削除">×</button></div><p>${esc(p.text)}</p></article>`;
    }).join(''):'<div class="empty">この日の投稿はまだありません。</div>';
  }
  function renderLearnings(){renderLearnCalendar();renderLearnList()}
  function renderAll(){renderSettings();renderForm();renderHome();renderReport();renderMissions();renderDaily();renderLearnings()}
  function nearAlerts(){
    const dismissed=new Set(state.dismissedAlerts||[]);
    const list=[];
    state.missions.forEach(m=>{
      const tasks=m.tasks||[];
      const allDone=tasks.length>0 && tasks.every(t=>t.status==='done');
      if(m.due && !allDone){
        const days=daysUntil(m.due);
        if(days!==null && days<=3) list.push({key:`mission:${m.id}:${m.due}`,name:m.title||'無題のミッション',detail:'ミッションの期日',days});
      }
      tasks.forEach(t=>{
        if(t.status==='done' || !t.due) return;
        const days=daysUntil(t.due);
        if(days===null || days>3) return;
        list.push({key:`task:${t.id}:${t.due}`,name:t.title||'無題のタスク',detail:m.title||'ミッション',days});
      });
    });
    return list.filter(a=>!dismissed.has(a.key)).sort((a,b)=>a.days-b.days);
  }
  function showDeadlineNotice(){
    const el=$('#deadlineNotice');
    if(!el || deadlineSnoozed) return;
    const items=nearAlerts();
    if(!items.length){el.classList.add('hidden');return}
    $('#deadlineList').innerHTML=items.map(a=>{
      const when=a.days<0?`${-a.days}日超過`:a.days===0?'今日が期日':`あと${a.days}日`;
      return `<li class="${a.days<0?'overdue':''}"><strong>${esc(a.name)}</strong><span>${esc(a.detail)}</span><em>${when}</em></li>`;
    }).join('');
    el.classList.remove('hidden');
  }
  function dismissDeadline(){
    commitOpenForms();
    const keys=nearAlerts().map(a=>a.key);
    state.dismissedAlerts=[...new Set([...(state.dismissedAlerts||[]),...keys])];
    saveState();
    $('#deadlineNotice').classList.add('hidden');
  }
  function saveCurrent(){
    const items=mode==='monthly'?monthlyItemsFor($('#formPeriod').value):state.weeklyItems;
    const answers={};
    items.forEach((_,i)=>{const v=document.querySelector(`input[name="check-${i}"]:checked`)?.value;if(v)answers[i]=v});
    const data={answers,reflection:$('#reflectionInput').value.trim()};
    if(mode==='monthly'){
      data.theme=$('#themeInput').value.trim();
      data.items=[...items];
      state.monthly[$('#formPeriod').value]={...(state.monthly[$('#formPeriod').value]||{}),...data};
    }else{
      const wk=weekKey($('#formPeriod').value);
      const idx=state.weekly.findIndex(x=>x.week===wk);
      data.week=wk;
      if(idx>=0) state.weekly[idx]=data; else state.weekly.push(data);
    }
    persist();
    toast('振り返りを保存しました');
  }
  function download(name,type,contents){
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([contents],{type}));
    a.download=name;
    document.body.append(a);a.click();a.remove();
    URL.revokeObjectURL(a.href);
  }
  function csvEscape(v){return '"'+String(v).replaceAll('"','""')+'"'}
  function addMission(){
    commitMissionsFromDom();
    state.missions.unshift({id:uid(),title:'',response:'',due:'',period:missionHalf,tasks:[]});
    renderMissions();
    saveState();
    const added=$('#missionList .mission-card');
    added?.scrollIntoView({block:'nearest'});
    added?.querySelector('.mission-title')?.focus();
  }
  function addMissionTask(btn){
    const card=btn.closest('.mission-card');
    const title=card.querySelector('.new-task').value.trim();
    if(!title){toast('タスク名を入力してください');return}
    commitMissionsFromDom();
    const mission=state.missions.find(m=>m.id===card.dataset.mid);
    mission.tasks.push({id:uid(),title,due:'',status:'todo'});
    renderMissions();
    saveState();
    toast('タスクを追加しました');
  }
  function deleteMission(id){
    if(!confirm('このミッションを削除しますか？')) return;
    commitMissionsFromDom();
    state.missions=state.missions.filter(m=>m.id!==id);
    renderMissions();
    saveState();
    toast('ミッションを削除しました');
  }
  function deleteMissionTask(id){
    commitMissionsFromDom();
    state.missions.forEach(m=>{m.tasks=m.tasks.filter(t=>t.id!==id)});
    renderMissions();
    saveState();
  }
  function addDailyTask(){
    const title=$('#addDailyTask').value.trim();
    if(!title){toast('タスク名を入力してください');return}
    commitDailyFromDom();
    const rec=state.daily[dailyShown];
    rec.tasks.push({id:uid(),title,status:'todo'});
    $('#addDailyTask').value='';
    renderDaily();
    saveState();
  }
  function deleteDailyTask(id){
    commitDailyFromDom();
    const rec=state.daily[dailyShown];
    if(rec) rec.tasks=rec.tasks.filter(t=>t.id!==id);
    renderDaily();
    saveState();
  }
  function postLearn(){
    const text=$('#learnInput').value.trim();
    const date=$('#learnDate').value;
    if(!date){toast('日付を選んでください');return}
    if(!text){toast('内容を入力してください');return}
    state.learnings.unshift({id:uid(),date,text,createdAt:new Date().toISOString()});
    $('#learnInput').value='';
    if(!date.startsWith($('#learnMonth').value)) $('#learnMonth').value=date.slice(0,7);
    saveState();
    renderLearnings();
    toast('学びを記録しました');
  }
  function deleteLearn(id){
    state.learnings=state.learnings.filter(p=>p.id!==id);
    saveState();
    renderLearnings();
    toast('投稿を削除しました');
  }

  $$('.add-row button[data-add]').forEach(btn=>btn.addEventListener('click',()=>{
    const type=btn.dataset.add;
    const input=$('#add'+type[0].toUpperCase()+type.slice(1));
    const v=input.value.trim();
    if(!v) return;
    const list=type==='monthly'?editableMonthlyItems():state[type+'Items'];
    list.push(v);
    if(type==='monthly') syncMonthlyDefaults(monthlySettingsPeriod(),list);
    input.value='';
    persist();
    toast('チェック項目を追加しました');
  }));
  document.addEventListener('click',e=>{
    const del=e.target.closest('[data-delete]');
    if(del){
      const type=del.dataset.delete;
      const list=type==='monthly'?editableMonthlyItems():state[type+'Items'];
      list.splice(Number(del.dataset.index),1);
      if(type==='monthly') syncMonthlyDefaults(monthlySettingsPeriod(),list);
      persist();
      toast('項目を削除しました');
      return;
    }
    const missionJump=e.target.closest('.mission-jump');
    if(missionJump){
      document.querySelector(`#missionList .mission-card[data-mid="${CSS.escape(missionJump.dataset.mid)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    const day=e.target.closest('#learnCalendar [data-date]');
    if(day){
      $('#learnDate').value=day.dataset.date;
      renderLearnList();
      renderLearnCalendar();
      return;
    }
    const btn=e.target.closest('[data-action]');
    if(!btn) return;
    const action=btn.dataset.action;
    if(action==='add-task') addMissionTask(btn);
    if(action==='delete-mission') deleteMission(btn.dataset.id);
    if(action==='delete-task') deleteMissionTask(btn.dataset.id);
    if(action==='delete-daily') deleteDailyTask(btn.dataset.id);
    if(action==='delete-learn') deleteLearn(btn.dataset.id);
  });
  document.addEventListener('change',e=>{
    if(e.target.id==='dailyDate') return;
    const mission=e.target.closest('.mission-card');
    if(mission){
      const movedPeriod=e.target.classList.contains('mission-period')?e.target.value:'';
      commitMissionsFromDom();
      if(movedPeriod) missionHalf=parseHalf(movedPeriod).key;
      saveState();
      if(movedPeriod) renderMissions();
      else { paintMissionProgress(mission); renderMissionSummary(); }
      return;
    }
    if(e.target.closest('#dailyCard')){
      commitDailyFromDom();
      saveState();
      paintDailyProgress();
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter' || !e.target.classList.contains('new-task')) return;
    e.preventDefault();
    const btn=e.target.closest('.add-row')?.querySelector('[data-action="add-task"]');
    if(btn) addMissionTask(btn);
  });
  window.addEventListener('beforeunload',()=>{try{commitOpenForms();saveState()}catch{}});

  $('#monthlyTab').onclick=()=>{mode='monthly';$('#formPeriod').type='month';$('#formPeriod').value=$('#homeMonth').value;renderForm();renderSettings()};
  $('#weeklyTab').onclick=()=>{if(!state.weeklyItems.length)return;mode='weekly';$('#formPeriod').type='date';$('#formPeriod').value=todayStr;renderForm();renderSettings()};
  $('#formPeriod').onchange=()=>{renderForm();renderSettings()};
  $('#saveCheck').onclick=saveCurrent;
  $('#clearForm').onclick=()=>{
    if(!confirm('この期間の入力内容をクリアしますか？')) return;
    if(mode==='monthly') delete state.monthly[$('#formPeriod').value];
    else state.weekly=state.weekly.filter(x=>x.week!==weekKey($('#formPeriod').value));
    persist();
    toast('入力をクリアしました');
  };
  $('#homeMonth').onchange=()=>{
    if(mode==='monthly'){$('#formPeriod').value=$('#homeMonth').value;renderForm()}
    $('#reportMonth').value=$('#homeMonth').value;
    $('#mottoEditor').classList.add('hidden');
    renderForm();renderSettings();renderHome();renderReport();
  };
  $('#editMotto').onclick=()=>{$('#mottoEditor').classList.toggle('hidden');if(!$('#mottoEditor').classList.contains('hidden'))$('#mottoInput').focus()};
  $('#cancelMotto').onclick=()=>{$('#mottoEditor').classList.add('hidden');renderHome()};
  $('#saveMotto').onclick=()=>{
    const m=$('#homeMonth').value;
    state.monthly[m]={...(state.monthly[m]||{}),motto:$('#mottoInput').value.trim()};
    $('#mottoEditor').classList.add('hidden');
    persist();
    toast('今月の言葉を保存しました');
  };
  $$('.edit-link,[data-go]').forEach(b=>b.onclick=()=>setPage(b.dataset.go));
  $$('nav button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
  $('#closeBackupNotice').onclick=closeBackupNotice;
  $('#closeBackupNoticeSecondary').onclick=closeBackupNotice;
  $('#openBackupFromNotice').onclick=()=>{closeBackupNotice();setPage('check')};
  $('#closeDeadlineNotice').onclick=dismissDeadline;
  $('#openMissionFromNotice').onclick=()=>{deadlineSnoozed=true;$('#deadlineNotice').classList.add('hidden');setPage('mission')};
  $('#addMission').onclick=addMission;
  $('#missionHalfTabs').onclick=e=>{
    const tab=e.target.closest('[data-half-key]');
    if(!tab || tab.dataset.halfKey===parseHalf(missionHalf).key) return;
    setMissionHalf(tab.dataset.halfKey);
  };
  $('#addDailyTaskBtn').onclick=addDailyTask;
  $('#addDailyTask').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addDailyTask()}});
  $('#dailyDate').addEventListener('change',()=>{
    commitDailyFromDom();
    saveState();
    dailyShown=$('#dailyDate').value||dailyShown;
    renderDaily();
  });
  $('#saveDaily').onclick=()=>{commitDailyFromDom();saveState();paintDailyProgress();toast('この日のタスクを保存しました')};
  $('#clearDaily').onclick=()=>{
    if(!confirm('この日のタスクと振り返りをクリアしますか？')) return;
    delete state.daily[dailyShown];
    renderDaily();
    saveState();
    toast('この日の入力をクリアしました');
  };
  $('#learnMonth').onchange=()=>{
    const month=$('#learnMonth').value;
    if(month && !$('#learnDate').value.startsWith(month)) $('#learnDate').value=`${month}-01`;
    renderLearnings();
  };
  $('#learnDate').onchange=()=>{
    const date=$('#learnDate').value;
    if(date && !date.startsWith($('#learnMonth').value)) $('#learnMonth').value=date.slice(0,7);
    renderLearnings();
  };
  $('#postLearn').onclick=postLearn;
  $('#exportCsv').onclick=()=>download('振り返りチェック項目.csv','text/csv;charset=utf-8','\uFEFF頻度,項目\n'+[...state.monthlyItems.map(x=>['月次',x]),...state.weeklyItems.map(x=>['週次',x])].map(r=>r.map(csvEscape).join(',')).join('\n'));
  $('#importCsv').onchange=async e=>{
    const file=e.target.files[0];
    if(!file) return;
    const text=(await file.text()).replace(/^\uFEFF/,'');
    const rows=text.split(/\r?\n/).slice(1).filter(Boolean).map(line=>{
      const a=[...line.matchAll(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g)].map(x=>(x[1]??x[2]??'').replaceAll('""','"'));
      return a;
    });
    let add=0;
    rows.forEach(([f,item])=>{
      const type=/週/.test(f)?'weekly':'monthly';
      if(item && !state[type+'Items'].includes(item)){state[type+'Items'].push(item);add++}
    });
    persist();
    toast(`${add}件の項目を読み込みました`);
    e.target.value='';
  };
  $('#exportBackup').onclick=()=>{
    commitOpenForms();
    const backup={app:'work-partner',version:2,exportedAt:new Date().toISOString(),data:state};
    download(`ワークパートナーバックアップ_${isoDate(new Date())}.json`,'application/json;charset=utf-8',JSON.stringify(backup,null,2));
    toast('バックアップを保存しました');
  };
  $('#importBackup').onchange=async e=>{
    const file=e.target.files[0];
    if(!file) return;
    try{
      const backup=JSON.parse(await file.text());
      const data=backup?.data;
      const appOk=backup?.app==='work-partner'||backup?.app==='omamori-reflection';
      if(!appOk||!data||!Array.isArray(data.monthlyItems)||!Array.isArray(data.weeklyItems)||typeof data.monthly!=='object'||(!Array.isArray(data.weekly)&&typeof data.weekly!=='object')) throw new Error('invalid');
      if(!confirm('現在のデータを、バックアップの内容で置き換えます。よろしいですか？')) return;
      state=normalize(data);
      mode='monthly';
      $('#formPeriod').type='month';
      $('#formPeriod').value=$('#homeMonth').value;
      persist({commit:false});
      toast('バックアップを復元しました');
    }catch{alert('このアプリのバックアップファイルではないか、ファイルが壊れています。')}
    finally{e.target.value=''}
  };
  $('#printPdf').onclick=()=>window.print();
  $('#exportExcel').onclick=()=>{
    const s=monthSnapshot($('#reportMonth').value);
    const checks=s.items.map((x,i)=>`<tr><td>${esc(x)}</td><td>${s.monthly.answers?.[i]==='yes'?'できた':s.monthly.answers?.[i]==='no'?'できてない':'未回答'}</td></tr>`).join('');
    const missions=s.missions.flatMap(m=>[`<tr><th colspan="4">${esc(m.title||'無題のミッション')}（${m.progress.total?m.progress.pct+'%':'未設定'}）</th></tr>`,`<tr><td colspan="4">${esc(m.response||'')}</td></tr>`,`<tr><th>タスク</th><th>状態</th><th>期日</th><th></th></tr>`,...(m.tasks.length?m.tasks.map(t=>`<tr><td>${esc(t.title||'')}</td><td>${t.status==='done'?'完了':t.status==='doing'?'進行中':'未着手'}</td><td>${esc(t.due||'')}</td><td></td></tr>`):['<tr><td colspan="4">タスクなし</td></tr>'])]).join('');
    const daily=s.days.map(d=>`<tr><td>${esc(d.date)}</td><td>${d.progress.done}/${d.progress.total}</td><td>${esc(d.tasks.map(t=>`${t.status==='done'?'完了':'未完了'}:${t.title}`).join(' / '))}</td><td>${esc(d.reflection||'')}</td></tr>`).join('');
    const posts=s.posts.map(p=>`<tr><td>${esc(p.date)}</td><td colspan="3">${esc(p.text)}</td></tr>`).join('');
    const html=`<html><meta charset="UTF-8"><table border="1"><tr><th colspan="4">${monthName(s.month)} 振り返りレポート</th></tr><tr><th>月次達成率</th><td>${s.sc??'未入力'}${s.sc!==null?'%':''}</td><th>テーマ</th><td>${esc(s.monthly.theme||'未設定')}</td></tr><tr><th>ミッション達成率</th><td>${s.missionP.total?s.missionP.pct+'%':'未入力'}</td><th>日時タスク達成率</th><td>${s.dailyP.total?s.dailyP.pct+'%':'未入力'}</td></tr><tr><th>学び</th><td colspan="3">${s.learnDays}日・${s.posts.length}件</td></tr><tr><th colspan="4">月次チェック</th></tr><tr><th>項目</th><th>結果</th><th></th><th></th></tr>${checks}<tr><th>振り返りメモ</th><td colspan="3">${esc(s.monthly.reflection||'')}</td></tr><tr><th colspan="4">ミッション</th></tr>${missions||'<tr><td colspan="4">なし</td></tr>'}<tr><th colspan="4">日時タスク</th></tr><tr><th>日</th><th>進捗</th><th>タスク</th><th>振り返り</th></tr>${daily||'<tr><td colspan="4">なし</td></tr>'}<tr><th colspan="4">学び記録</th></tr>${posts||'<tr><td colspan="4">なし</td></tr>'}</table></html>`;
    download(`${s.month}_振り返りレポート.xls`,'application/vnd.ms-excel;charset=utf-8',html);
  };

  $('#homeMonth').value=current;
  $('#formPeriod').value=current;
  $('#reportMonth').onchange=()=>renderReport();
  $('#reportMonth').value=current;
  $('#dailyDate').value=todayStr;
  $('#learnMonth').value=current;
  $('#learnDate').value=todayStr;
  renderAll();
  domReady=true;
  showBackupNotice();
  showDeadlineNotice();
})();
