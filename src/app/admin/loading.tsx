import LoadingSkeleton from '@/components/LoadingSkeleton'

export default function Loading() {
  return (
    <div className="min-h-dvh p-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <LoadingSkeleton variant="banner" />
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    </div>
  )
}
