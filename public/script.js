const SKILLS=["Mason","Carpenter","Electrician","Plumber","Painter","Farm labour","Driver","Cook / Helper","Loader","Cleaner","Tailor","Welder"];
const $=s=>document.querySelector(s);
const esc=t=>String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function toast(m){const e=$("#toast");e.textContent=m;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2500)}
function debounce(fn,ms=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
function localDateValue(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function renderBySkill(container,rows,skillsForRow,renderCard,emptyMessage,selectedSkill){
  if(!rows.length){container.innerHTML=`<div class="empty">${emptyMessage}</div>`;return}
  const grouped=new Map(SKILLS.map(skill=>[skill,[]]));
  rows.forEach(row=>skillsForRow(row).forEach(skill=>{
    if(grouped.has(skill)&&(!selectedSkill||selectedSkill===skill))grouped.get(skill).push(row);
  }));
  container.innerHTML=[...grouped].filter(([,items])=>items.length).map(([skill,items])=>`
    <div class="category-group">
      <h3 class="category-title">${esc(skill)}</h3>
      <div class="category-list">${items.map(renderCard).join("")}</div>
    </div>`).join("");
}

async function api(path,opts){
  const r=await fetch(path,opts);
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    const message=d&&typeof d.error==="string"?d.error:
      r.status===404
        ?"API route not found. Restart the server to load the latest routes."
        :`Request failed (HTTP ${r.status}). Please try again.`;
    throw new Error(message);
  }
  return d;
}
const post=(p,body)=>api(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

async function renderJobs(){
  const q=new URLSearchParams({skill:$("#fSkill").value,town:$("#fTown").value});
  try{
    const rows=await api("/api/jobs?"+q);
    renderBySkill($("#jobList"),rows,j=>[j.skill],j=>`
      <article class="item ${j.score>=100?"hi":""}">
        <div class="top"><strong>${esc(j.title)}</strong><span class="pill ${j.score>=100?"ok":""}">${j.score}% match</span></div>
        <div class="meta">${esc(j.skill)} · ${esc(j.town)} · ${j.job_date ? new Date(`${j.job_date}T00:00:00`).toLocaleDateString() : "Date not specified"}</div>
        <div><b>₹${j.wage}</b> per day · Posted by ${esc(j.owner)}</div>
        <a class="call" href="tel:+91${esc(j.phone)}" aria-label="Call ${esc(j.phone)}"><span>Call</span> <strong>${esc(j.phone)}</strong></a>
      </article>`,"No jobs found for this skill yet. Try another skill or check back soon.",$("#fSkill").value);
  }catch(e){$("#jobList").innerHTML=`<div class="empty">Could not load jobs. Check your internet and refresh.</div>`}
}

async function renderWorkers(){
  const q=new URLSearchParams({skill:$("#wSkill").value,town:$("#wTown").value,availableOn:$("#wDate").value});
  try{
    const rows=await api("/api/workers?"+q);
    renderBySkill($("#workerList"),rows,w=>w.skills,w=>`
      <article class="item ${w.score>=100?"hi":""}">
        <div class="top"><strong>${esc(w.name)}</strong><span class="pill ${w.score>=100?"ok":""}">${w.score}% match</span></div>
        <div class="meta">${w.skills.map(esc).join(", ")} · ${esc(w.town)}</div>
        <div>Available from ${w.availability_date ? new Date(`${w.availability_date}T00:00:00`).toLocaleDateString() : "date not specified"}</div>
        <div>Expects <b>₹${w.wage}</b> per day</div>
        <a class="call" href="tel:+91${esc(w.phone)}" aria-label="Call ${esc(w.phone)}"><span>Call</span> <strong>${esc(w.phone)}</strong></a>
      </article>`,"No workers found for this skill yet.",$("#wSkill").value);
  }catch(e){$("#workerList").innerHTML=`<div class="empty">Could not load workers. Check your internet and refresh.</div>`}
}

function init(){
  const today=new Date();today.setHours(0,0,0,0);
  const lastDate=new Date(today);lastDate.setDate(lastDate.getDate()+30);
  [$("#workerForm [name=availability_date]"),$("#jobForm [name=job_date]"),$("#wDate")].forEach(input=>{
    input.min=localDateValue(today);input.max=localDateValue(lastDate);
  });
  const opts=`<option value="">Any skill</option>`+SKILLS.map(s=>`<option>${s}</option>`).join("");
  $("#fSkill").innerHTML=opts;$("#wSkill").innerHTML=opts;
  $("#jobSkill").innerHTML=SKILLS.map(s=>`<option>${s}</option>`).join("");
  $("#workerSkills").innerHTML=SKILLS.map(s=>`<label><input type="checkbox" value="${s}">${s}</label>`).join("");
  renderJobs();renderWorkers();
}

document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll("nav button").forEach(x=>x.setAttribute("aria-selected",x===b));
  document.querySelectorAll("section").forEach(s=>s.classList.toggle("on",s.id===b.dataset.tab));
}));

$("#fSkill").addEventListener("input",renderJobs);
$("#fTown").addEventListener("input",debounce(renderJobs));
$("#wSkill").addEventListener("input",renderWorkers);
$("#wTown").addEventListener("input",debounce(renderWorkers));
$("#wDate").addEventListener("change",renderWorkers);

$("#workerForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  const skills=[...e.target.querySelectorAll("#workerSkills input:checked")].map(i=>i.value);
  if(!skills.length){toast("Choose at least one skill");return}
  try{
    const result=await post("/api/workers",{name:f.get("name"),phone:f.get("phone"),town:f.get("town"),availability_date:f.get("availability_date"),wage:+f.get("wage"),skills});
    e.target.reset();renderWorkers();toast(result.updated?"Profile updated":"Profile saved");
  }catch(err){toast(err.message)}
});

$("#jobForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=new FormData(e.target);
  try{
    await post("/api/jobs",{title:f.get("title"),skill:f.get("skill"),town:f.get("town"),wage:+f.get("wage"),job_date:f.get("job_date"),owner:f.get("owner"),phone:f.get("phone")});
    e.target.reset();renderJobs();toast("Job published");
  }catch(err){toast(err.message)}
});

const deleteWorkerPhoneForm=$("#deleteWorkerPhoneForm");
const deleteWorkerOtpForm=$("#deleteWorkerOtpForm");
let pendingDeletePhone="";

async function requestWorkerDeletionCode(phoneNumber){
  try{
    await post("/api/workers/delete/request",{phone:phoneNumber});
    pendingDeletePhone=phoneNumber;
    deleteWorkerPhoneForm.hidden=true;
    deleteWorkerOtpForm.hidden=false;
    deleteWorkerOtpForm.querySelector("[name=code]").focus();
    toast("Verification code sent by SMS");
  }catch(err){toast(err.message)}
}

deleteWorkerPhoneForm.addEventListener("submit",e=>{
  e.preventDefault();
  const form=new FormData(e.target);
  requestWorkerDeletionCode(form.get("phone"));
});

$("#resendDeleteCode").addEventListener("click",()=>{
  if(pendingDeletePhone)requestWorkerDeletionCode(pendingDeletePhone);
});

deleteWorkerOtpForm.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!window.confirm("Delete your worker profile? This cannot be undone."))return;
  const form=new FormData(e.target);
  try{
    await post("/api/workers/delete/confirm",{phone:pendingDeletePhone,code:form.get("code")});
    deleteWorkerPhoneForm.reset();
    deleteWorkerOtpForm.reset();
    deleteWorkerOtpForm.hidden=true;
    deleteWorkerPhoneForm.hidden=false;
    pendingDeletePhone="";
    await renderWorkers();
    toast("Worker profile deleted");
  }catch(err){toast(err.message)}
});

init();