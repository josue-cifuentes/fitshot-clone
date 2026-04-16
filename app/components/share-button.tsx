"use client";

export function ShareButton({ title, text, url }: { title: string; text: string; url?: string }) {
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url: url || window.location.href,
        });
      } catch (err) {
        console.error("Error sharing:", err);
      }
    } else {
      // Fallback for browsers that don't support navigator.share
      alert("Sharing is not supported on this browser. You can copy the URL manually.");
    }
  };

  return (
    <button
      onClick={handleShare}
      className="p-2 rounded-full bg-[#E8FF00]/10 text-[#E8FF00] hover:bg-[#E8FF00]/20 transition"
      title="Share"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </button>
  );
}
