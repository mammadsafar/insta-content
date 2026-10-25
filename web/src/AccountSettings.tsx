import {useState} from 'react';
import {Action,Field,Modal,Upload,api,mediaUrl,useSession,type Row} from './lib';

export function ProfilePhoto(){
  const {user,refresh,toast}=useSession();
  const [avatarId,setAvatar]=useState<string|null|undefined>(user.avatar_id),[saved,setSaved]=useState(user.avatar_id);
  const changed=(avatarId||null)!==(saved||null);
  return <section className="profile-photo" aria-label="عکس پروفایل شخصی">
    <div className="profile-photo-heading"><span className="avatar profile-photo-preview">{avatarId?<img src={mediaUrl(avatarId,true)} alt="عکس پروفایل شما"/>:user.name.slice(0,1)}</span><div><h3>عکس پروفایل</h3><p className="muted">عکس شخصی شما؛ قابل تغییر فقط توسط خودتان. حداکثر ۵ مگابایت.</p></div></div>
    <Upload purpose="profile_avatar" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple={false} onUploaded={asset=>setAvatar(asset.id)}/>
    <div className="member-actions"><Action className="primary" disabled={!changed} run={async()=>{await api('/auth/me',{avatarId:avatarId||null},'PATCH');setSaved(avatarId||null);await refresh();toast('عکس پروفایل ذخیره شد');}}>ذخیره عکس پروفایل</Action>{avatarId&&<button onClick={()=>setAvatar(null)}>حذف عکس</button>}</div>
    {changed&&<p className="muted" role="status">برای ثبت تغییر، «ذخیره عکس پروفایل» را بزنید.</p>}
  </section>;
}

export function ResetMemberPassword({member,onClose}:{member:Row;onClose:()=>void}){
  const {toast}=useSession(),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const mismatch=!!confirmation&&confirmation!==password;
  return <Modal title={`بازنشانی رمز ${member.name}`} onClose={onClose}>
    <p className="notice">با ذخیره رمز تازه، تمام نشست‌های این عضو بسته می‌شوند و باید دوباره وارد شود.</p>
    <Field label="رمز جدید (حداقل ۱۲ نویسه)"><input type="password" dir="ltr" autoComplete="new-password" minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></Field>
    <Field label="تکرار رمز جدید"><input type="password" dir="ltr" autoComplete="new-password" maxLength={256} aria-invalid={mismatch} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></Field>
    {mismatch&&<p className="error" role="alert">تکرار رمز با رمز جدید یکسان نیست.</p>}
    <Action className="primary" disabled={password.length<12||password!==confirmation} run={async()=>{await api(`/users/${member.id}`,{password},'PATCH');setPassword('');setConfirmation('');toast(`رمز ${member.name} بازنشانی شد؛ نشست‌های قبلی بسته شدند`);onClose();}}>ذخیره رمز جدید</Action>
  </Modal>;
}
