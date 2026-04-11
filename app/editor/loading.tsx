export default function EditorLoading() {
  return (
    <div className="flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-4 bg-[#0A0A0A] px-4">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-[#F5F5F5]/20 border-t-[#E8FF00]"
        role="status"
        aria-label="Loading activities"
      />
      <p className="text-sm font-medium text-[#F5F5F5]/70">
        Loading Strava activities…
      </p>
    </div>
  );
}
