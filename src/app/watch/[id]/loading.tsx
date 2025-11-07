import LoadingSkeleton from '@/components/LoadingSkeleton'

export default function Loading() {
  return (
    <div className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="h-28 w-44 rounded bg-gray-200/70 dark:bg-gray-800/60" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-40 rounded bg-gray-200/70 dark:bg-gray-800/60" />
            <div className="h-4 w-28 rounded bg-gray-200/70 dark:bg-gray-800/60" />
          </div>
        </div>
        <LoadingSkeleton variant="grid" count={6} />
      </div>
    </div>
  )
}
