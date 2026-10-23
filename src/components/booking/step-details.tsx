/** Step 3 — data diri, tambahan, ringkasan. */

/* ---HEAD-PLACEHOLDER--- */

    <div className="space-y-5">
      <h2 ref={stepHeadingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
        Data Diri
      </h2>
      {/* One required-marker style: `*` next to the label means required, "opsional"
          in the label means not. A legend explaining the asterisk only duplicates
          that in a second place to keep in sync. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">
            Nama <span className="text-danger">*</span>
          </Label>
          <Input
            id="name"
            required
            autoComplete="name"
            enterKeyHint="next"
            aria-invalid={fieldError.name ? true : undefined}
            aria-describedby={fieldError.name ? "name-error" : undefined}
            value={customer.name}
            maxLength={80}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={(e) => onNameBlur(e.target.value)}
          />
          {fieldError.name && (
            <p id="name-error" className="text-xs text-danger">
              {fieldError.name}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">
            Nomor WhatsApp <span className="text-danger">*</span>
          </Label>
          <Input
            id="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder="08xx xxxx xxxx"
