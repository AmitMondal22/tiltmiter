import React from 'react';

export function SkeletonBox({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 w-full animate-fadeIn">
      {/* Header skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <SkeletonBox className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <SkeletonBox className="h-4 w-44" />
            <SkeletonBox className="h-3 w-64" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-24 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* KPI row skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2.5">
            <SkeletonBox className="h-3 w-24" />
            <SkeletonBox className="h-7 w-16" />
            <SkeletonBox className="h-2.5 w-32" />
          </div>
        ))}
      </div>

      {/* Content / table skeleton */}
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="relative h-[calc(100vh-88px)] min-h-[640px] rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden shadow-xs">
      <div className="w-full h-full animate-pulse bg-gradient-to-br from-slate-200/70 via-slate-100 to-slate-200/80" />
      {/* Top-left search & zoom stack skeleton */}
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 p-1.5 rounded-xl bg-white/85 border border-slate-200 shadow-sm">
          <SkeletonBox className="h-7 w-36 rounded-lg" />
          <SkeletonBox className="h-7 w-7 rounded-lg" />
          <SkeletonBox className="h-7 w-24 rounded-lg" />
          <SkeletonBox className="h-7 w-24 rounded-lg" />
        </div>
        <div className="flex flex-col gap-1 p-1 rounded-xl bg-white/85 border border-slate-200 w-9">
          <SkeletonBox className="h-7 w-7 rounded-lg" />
          <SkeletonBox className="h-7 w-7 rounded-lg" />
          <SkeletonBox className="h-7 w-7 rounded-lg" />
        </div>
      </div>
      {/* Top-right toolbar skeleton */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 p-1 rounded-xl bg-white/85 border border-slate-200 w-9">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBox key={i} className="h-7 w-7 rounded-lg" />
        ))}
      </div>
      {/* Bottom-left coordinate readout skeleton */}
      <div className="absolute bottom-3 left-3 space-y-1">
        <SkeletonBox className="h-6 w-48 rounded-md" />
        <SkeletonBox className="h-4 w-32 rounded" />
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-4 w-full animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <SkeletonBox className="w-9 h-9 rounded-xl" />
          <div className="space-y-2">
            <SkeletonBox className="h-5 w-48" />
            <SkeletonBox className="h-3 w-72" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-9 w-28 rounded-xl" />
          <SkeletonBox className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-3">
          <SkeletonBox className="w-full h-[520px] rounded-xl" />
        </div>
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <SkeletonBox className="h-8 w-full rounded-xl" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100 space-y-2">
                <SkeletonBox className="h-4 w-36" />
                <SkeletonBox className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
        <SkeletonBox className="h-4 w-36" />
        <SkeletonBox className="h-4 w-20" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="px-4 py-3 flex items-center gap-3">
            {Array.from({ length: cols }).map((__, cIdx) => (
              <SkeletonBox
                key={cIdx}
                className={`h-4 ${cIdx === 0 ? 'w-32' : cIdx === cols - 1 ? 'w-20 ml-auto' : 'flex-1'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ heightClass = 'h-64' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonBox className="h-4 w-44" />
        <div className="flex items-center gap-2">
          <SkeletonBox className="h-6 w-16 rounded-lg" />
          <SkeletonBox className="h-6 w-16 rounded-lg" />
        </div>
      </div>
      <SkeletonBox className={`w-full ${heightClass} rounded-xl`} />
    </div>
  );
}

