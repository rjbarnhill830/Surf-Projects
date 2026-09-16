// Skill level is a trait of the person, not the surf zone, so it's stored
// under a plain (non zone-scoped) key and persists across zone switches.
// Wave style is treated more like a "mood for today" and isn't persisted —
// it resets to no-preference on reload, same as the current-conditions
// sliders.
let userSkillLevel = 'advanced';
let userWaveStyles = [];

async function loadUserSkillLevel(){
  try{
    const res = await storage.get('user-skill-level');
    userSkillLevel = res && res.value ? res.value : 'advanced';
  }catch(e){ userSkillLevel = 'advanced'; }
}

async function persistUserSkillLevel(){
  try{ await storage.set('user-skill-level', userSkillLevel); }
  catch(e){ console.error('could not save skill level', e); }
}

function initPreferencesPanel(){
  const skillSelect = document.getElementById('userSkillLevel');
  skillSelect.value = userSkillLevel;
  skillSelect.addEventListener('change', async ()=>{
    userSkillLevel = skillSelect.value;
    await persistUserSkillLevel();
    render();
  });

  document.querySelectorAll('.user-wavestyle').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      userWaveStyles = Array.from(document.querySelectorAll('.user-wavestyle:checked')).map(el=>el.value);
      render();
    });
  });
}
