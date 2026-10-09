"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
const initial = { full_name:"", phone:"", address_line1:"", address_line2:"", city:"", region:"", postcode:"", country:"" };
export default function ProfilePage() {
  const router=useRouter();
  const [supabase]=useState(()=>createClient());
  const [user,setUser]=useState(null);
  const [form,setForm]=useState(initial);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{ let active=true; (async()=>{
    const {data:{user:u}}=await supabase.auth.getUser();
    if(!active)return;
    if(!u){router.replace("/login");return;}
    setUser(u);
    const {data,error}=await supabase.from("customer_profiles").select("*").eq("user_id",u.id).maybeSingle();
    if(!active)return;
    if(error){setMessage("Profile storage is not ready. Run the included Supabase migration.");}
    const meta=u.user_metadata||{};
    setForm(Object.fromEntries(Object.keys(initial).map(k=>[k, data?.[k]??(k==="full_name"?meta.display_name:meta[k])??""])));
    setLoading(false);
  })();return()=>{active=false;};},[router,supabase]);
  const update=(key,value)=>setForm(prev=>({...prev,[key]:value}));
  async function save(e){e.preventDefault();if(!user)return;setSaving(true);setMessage("");
    if(!["full_name","phone","address_line1","city","country"].every(k=>form[k].trim())){setMessage("Please complete your name, phone number, street address, city and country.");setSaving(false);return;}
    if(!/^\+[1-9]\d{6,14}$/.test(form.phone.replace(/[\s()-]/g,""))){setMessage("Enter a valid international phone number beginning with + and country code.");setSaving(false);return;}
    const payload={...form,user_id:user.id,updated_at:new Date().toISOString()};
    const {error}=await supabase.from("customer_profiles").upsert(payload,{onConflict:"user_id"});
    if(error){setMessage("Unable to save profile: "+error.message);}else{setMessage("Profile saved successfully.");}
    setSaving(false);
  }
  async function resetPassword(){if(!user?.email)return;const {error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:window.location.origin+"/login"});setMessage(error?error.message:"Password reset email requested. Check your inbox.");}
  const fields=[["full_name","Full name"],["phone","Phone number"],["address_line1","Address line 1"],["address_line2","Address line 2"],["city","City / Town"],["region","County / State"],["postcode","Postcode / ZIP"],["country","Country"]];
  return <main className="profile-page"><div className="profile-panel"><div className="profile-header"><div><p className="profile-eyebrow">DRAMAAI STUDIO</p><h1>My Profile</h1><p>Manage your account details. Your information is private.</p></div><Link href="/">Back to dashboard →</Link></div>
  {loading?<p>Loading your profile…</p>:<form onSubmit={save}><label className="profile-field">Email address<input value={user?.email||""} disabled /></label><div className="profile-grid">{fields.map(([key,label])=><label className="profile-field" key={key}>{label}<input required={["full_name","phone","address_line1","city","country"].includes(key)} value={form[key]} onChange={e=>update(key,e.target.value)} maxLength={key==="phone"?32:200} autoComplete={key==="full_name"?"name":key==="phone"?"tel":"off"}/></label>)}</div><div className="profile-actions"><button type="submit" disabled={saving}>{saving?"Saving…":"Save changes"}</button><button type="button" className="profile-secondary" onClick={resetPassword}>Reset password</button></div>{message&&<p role="status" className="profile-status">{message}</p>}</form>}</div></main>;
}
