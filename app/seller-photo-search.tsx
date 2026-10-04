import {useEffect,useRef,useState} from 'react';
import {Search,Upload,ExternalLink} from 'lucide-react';
import {apiRequest,readConnection} from '@/lib/connection';
import {findSellerPhotos,downloadSellerPhoto,type SearchStatus,type SellerMatch,type SellerSource} from '@/lib/seller-photos';
import PhotoSearchSettings from './photo-search-settings';

type Props={original:Blob;disabled:boolean;onUse:(blob:Blob,source:SellerSource)=>Promise<void>;onBusy:(busy:boolean)=>void};
export default function SellerPhotoSearch({original,disabled,onUse,onBusy}:Props){
  const [status,setStatus]=useState<SearchStatus|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[matches,setMatches]=useState<SellerMatch[]|null>(null),[candidate,setCandidate]=useState<{blob:Blob;url:string;source:SellerSource}|null>(null);
  const [setup,setSetup]=useState(false),[setupBusy,setSetupBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0),candidateUrl=useRef('');
  useEffect(()=>{let active=true;if(readConnection())void apiRequest<SearchStatus>('sellerStatus').then(value=>{if(active)setStatus(value);}).catch(()=>{if(active)setError('Automatic search is unavailable. You can still use Google Lens below.');});return()=>{active=false;generation.current++;controller.current?.abort();if(candidateUrl.current)URL.revokeObjectURL(candidateUrl.current);};},[]);
  function clearCandidate(){if(candidateUrl.current)URL.revokeObjectURL(candidateUrl.current);candidateUrl.current='';setCandidate(null);}
  function preview(blob:Blob,source:SellerSource){clearCandidate();const url=URL.createObjectURL(blob);candidateUrl.current=url;setCandidate({blob,url,source});}
  async function run(action:(signal:AbortSignal,token:number)=>Promise<void>){
    controller.current?.abort();const next=new AbortController();controller.current=next;const token=++generation.current;
    setBusy(true);onBusy(true);setError('');
    try{await action(next.signal,token);}catch(e){if(token===generation.current&&!next.signal.aborted)setError((e as Error).message);}finally{if(token===generation.current){setBusy(false);onBusy(false);}}
  }
  const locked=disabled||busy||setupBusy;
  async function search(){
    setError('');
    if(!readConnection()){setSetup(true);return;}
    await run(async(signal,token)=>{
      // Refresh on every attempt so a newly connected key or monthly reset works immediately.
      const latest=await apiRequest<SearchStatus>('sellerStatus',{},undefined,signal);
      if(token!==generation.current)return;
      setStatus(latest);
      if(!latest.configured){setSetup(true);return;}
      if(latest.used>=latest.limit){setError('Monthly search limit reached. Open Google Lens below to find a seller photo now.');return;}
      setSetup(false);clearCandidate();setMatches(null);
      const result=await findSellerPhotos(original,signal);
      if(token===generation.current){setMatches(result.matches);setStatus(result.status);}
    });
  }
  async function select(match:SellerMatch){await run(async(signal,token)=>{const result=await downloadSellerPhoto(match.id,signal);if(token===generation.current)preview(result.blob,result.source);});}
  return <section className="seller-search" aria-label="Find a seller photo"><h3>Find a studio photo</h3><p>Choose a store photo of the same item. Your uploaded original stays as a backup.</p><button className="primary full" type="button" disabled={locked} onClick={()=>void search()}><Search size={17}/>{busy?'Working…':'Find seller photos'}</button>{(status?.configured===false||!readConnection())&&!setup&&<p className="small">Tap Find seller photos to set up automatic search. Google Lens below works without a search key.</p>}{status?.configured&&status.used>=status.limit&&<p className="small">Monthly search limit reached. Use Google Lens below or try again next month.</p>}{status?.configured&&<p className="small">Searching shares a resized photo with SerpApi and Google Lens.</p>}
    {setup&&<div className="seller-search-setup"><PhotoSearchSettings connected={!!readConnection()} initialStatus={status} disabled={disabled||busy} onBusy={value=>{setSetupBusy(value);onBusy(value);}} onStatusChange={value=>{setStatus(value);if(value.configured)setSetup(false);}}/><button className="quiet" type="button" disabled={locked} onClick={()=>setSetup(false)}>Close setup</button></div>}
    <div className="seller-fallback"><a className="secondary" href="https://lens.google/" target="_blank" rel="noreferrer"><ExternalLink size={16}/>Open Google Lens</a><button className="secondary" type="button" disabled={locked} onClick={()=>input.current?.click()}><Upload size={16}/>Upload seller photo</button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload seller photo" hidden disabled={locked} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;setError('');if(file.size>20*1024*1024){setError('Choose a seller photo under 20 MB.');return;}preview(file,{label:'Seller photo',url:''});}}/></div><p className="small">In Lens, select your original photo. Open the matching seller, save its photo, then upload that photo here.</p>
    {busy&&<p role="status">Finding or preparing your seller photo…</p>}{error&&<p className="error" role="alert">{error}</p>}
    {matches&&matches.length===0&&<p role="status">No matching photos found. Try Google Lens, or keep your original photo.</p>}
    {!!matches?.length&&<><p className="small">Possible matches · check the brand, design and color.</p><div className="seller-results">{matches.map(match=><article key={match.id}><img src={match.thumbnail} alt={match.title} loading="lazy" referrerPolicy="no-referrer"/><strong>{match.title}</strong><span>{match.source}</span>{match.width>0&&match.height>0&&<small>{match.width} × {match.height}</small>}<a href={match.pageUrl} target="_blank" rel="noreferrer">View seller</a><button className="secondary" disabled={locked} type="button" onClick={()=>void select(match)}>Preview photo</button></article>)}</div></>}
    {candidate&&<div className="seller-confirm"><img src={candidate.url} alt="Selected seller photo" onError={()=>{clearCandidate();setError('This photo cannot be opened. Save a JPG, PNG or WebP from the seller and try again.');}}/><p>Does this match your item’s design and color?</p>{candidate.source.url&&<a href={candidate.source.url} target="_blank" rel="noreferrer">{candidate.source.label}</a>}<div className="photo-picker-actions"><button className="primary" disabled={locked} type="button" onClick={()=>void run(async()=>{await onUse(candidate.blob,candidate.source);clearCandidate();})}>Use this photo</button><button className="quiet" disabled={locked} type="button" onClick={clearCandidate}>Cancel</button></div></div>}
  </section>;
}
