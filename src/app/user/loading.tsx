import LoadingSkeleton from '@/components/LoadingSkeleton'

export default function Loading() {
  return (
    <div className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-32 rounded bg-gray-200/70 dark:bg-gray-800/60" />
          <div className="h-8 w-20 rounded bg-gray-200/70 dark:bg-gray-800/60" />
        </div>
        <LoadingSkeleton variant="row" count={6} />
        <div className="h-8" />
        <LoadingSkeleton variant="row" count={6} />
      </div>
    </div>
  )
}
