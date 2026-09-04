import { useEffect, useState } from 'react';
import type { AppInfo } from '../../types/domain';
import { evoca } from '../../services/evoca';

interface Props {
  onClose: () => void;
}

export function About({ onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    evoca
      .getAppInfo()
      .then(setInfo)
      .catch((reason) => setError(String(reason)));
  }, []);

  return (
    <section className='flex h-full w-full flex-col overflow-hidden border border-evoca-line bg-[linear-gradient(180deg,rgba(18,21,27,.985),rgba(10,12,16,.995)),radial-gradient(circle_at_24%_0%,rgba(255,255,255,.04),transparent_34%)] shadow-[0_35px_100px_rgba(0,0,0,.58),0_12px_30px_rgba(0,0,0,.22),inset_0_1px_0_rgba(255,255,255,.035)]'>
      <div className='flex items-center justify-between border-b border-white/[.06] px-5 py-4 [--wails-draggable:drag]'>
        <div className='flex items-center gap-3'>
          <span className='grid h-8 w-8 shrink-0 place-items-center rounded-[11px] border border-evoca-accent/20 bg-[#F5E8C5] text-[30px] leading-none text-[#1B1B1A]'>
            ✦
          </span>
          <div>
            <h1 className='m-0 text-[13px] font-semibold tracking-[-.01em] text-white'>
              About eVoca
            </h1>
            <p className='text-[9px] leading-4 text-white/32'>Application information</p>
          </div>
        </div>
        <button
          type='button'
          className='inline-flex items-center gap-1.5 rounded-[9px] border border-white/[.07] bg-white/[.03] px-2.5 py-1.5 text-[9px] font-semibold text-white/60 transition hover:bg-white/[.06] hover:text-white'
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-5'>
        <div className='mx-auto max-w-2xl space-y-3'>
          {error ? (
            <div className='rounded-[14px] border border-red-200/10 bg-red-300/[.04] p-4 text-[10px] leading-5 text-evoca-danger'>
              Could not load application information: {error}
            </div>
          ) : (
            <>
              <div className='rounded-[16px] border border-white/[.06] bg-white/[.018] p-5'>
                <div className='text-[9px] font-semibold uppercase tracking-[.14em] text-white/25'>
                  Version
                </div>
                <div className='mt-2 text-[22px] font-semibold tracking-[-.03em] text-white'>
                  {info?.version ?? '…'}
                </div>
              </div>

              <div className='rounded-[16px] border border-white/[.06] bg-white/[.018] p-5'>
                <div className='text-[9px] font-semibold uppercase tracking-[.14em] text-white/25'>
                  Purpose
                </div>
                <p className='mt-2 text-[11px] leading-6 text-white/60'>
                  {info?.purpose ?? 'Loading…'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
