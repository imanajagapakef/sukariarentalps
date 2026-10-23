/** The three-step indicator at the top of the form. Purely presentational. */
export function Stepper({ step }: { step: number }) {
  const labels = ["Tempat", "Waktu", "Data Diri"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {labels.map((l, i) => {
        const n = i + 1;
        return (
          <li key={l} className="flex items-center gap-2">
            <span
              aria-current={step === n ? "step" : undefined}
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                step === n
                  ? "bg-primary text-primary-foreground"
                  : step > n
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step > n ? "✓" : n}
            </span>
            <span className={step === n ? "font-medium text-foreground" : "text-muted-foreground"}>{l}</span>
            {n < labels.length && <span aria-hidden className="mx-1 w-6 border-t border-border" />}
          </li>
        );
      })}
    </ol>
  );
}
