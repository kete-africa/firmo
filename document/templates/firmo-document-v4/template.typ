#let data = json(sys.inputs.at("case"))
#let ink = rgb("#181A1B")
#let muted = rgb("#656A6C")
#let hairline = rgb("#D9DDDC")
#let paper = rgb("#FFFFFF")
#let soft = rgb("#F4F5F3")

#let field(dict, key, fallback: none) = dict.at(key, default: fallback)

#let present(value) = {
  if value == none { false }
  else if type(value) == str { value.trim() != "" }
  else if type(value) == array { value.len() > 0 }
  else { true }
}

#let issuer = field(data, "issuer", fallback: (:))
#let client = field(data, "client", fallback: (:))
#let sections = field(data, "sections", fallback: ())
#let adjustments = field(data, "adjustments", fallback: ())
#let payments = field(data, "payments", fallback: ())
#let conditions = field(data, "conditions", fallback: ())

#let color-value = field(issuer, "color")
#let valid-color = type(color-value) == str and color-value.match(
  regex("^#[0-9a-fA-F]{6}$"),
) != none
#let raw-accent = if valid-color { rgb(color-value) } else { rgb("#656A6C") }
#let accent = if color.oklab(raw-accent).components(alpha: false).first() > 72% {
  raw-accent.darken(42%)
} else {
  raw-accent
}
#let accent-ink = if color.oklab(accent).components(alpha: false).first() > 58% { ink } else { white }

#let format-number(value) = {
  if value == none { return "" }
  let raw = str(value)
  let negative = raw.starts-with("-")
  let digits = if negative { raw.slice(1) } else { raw }
  let result = ""
  let count = 0
  for char in digits.clusters().rev() {
    if count > 0 and calc.rem(count, 3) == 0 {
      result = " " + result
    }
    result = char + result
    count += 1
  }
  if negative { "-" + result } else { result }
}

#let money(value, color: muted) = [#format-number(value) #text(size: 7pt, fill: color)[F CFA]]
#let tax-rate = field(data, "tax_rate")
#let tax-amount = field(data, "tax_amount")
#let grand-total = field(data, "grand_total")
#let deposit-percent = field(data, "deposit_percent")
#let deposit-requested = field(data, "deposit_requested")
#let indicative-after-deposit = field(data, "indicative_after_deposit")
#let paid-total = field(data, "paid_total")
#let balance-due = field(data, "balance_due")

#let issuer-name = field(issuer, "name", fallback: "")
#let issuer-mark = field(issuer, "mark", fallback: if present(issuer-name) {
  issuer-name.clusters().first()
} else {
  ""
})
#let issuer-logo = field(issuer, "logo")
#let usable-logo = issuer-logo == "assets/solvia.svg" or issuer-logo == "assets/artisan-logo.png" or issuer-logo == "assets/artisan-logo.jpg"
#let issuer-contact = (
  field(issuer, "trade"),
  field(issuer, "phone"),
).filter(present)

#set page(
  paper: "a4",
  margin: (x: 18mm, top: 16mm, bottom: 15mm),
  fill: paper,
  foreground: context {
    if data.number == "BROUILLON" {
      align(center + horizon)[
        #rotate(-24deg, text(
          font: "JetBrains Mono",
          size: 22pt,
          weight: 700,
          fill: rgb("#D7DBD8").transparentize(22%),
        )[APERÇU · BROUILLON])
      ]
    }
  },
  header: context {
    if counter(page).get().first() > 1 {
      set text(font: "JetBrains Mono", size: 6.8pt, fill: muted)
      grid(
        columns: (1fr, auto),
        align: (left, right),
        [#issuer-name],
        [#data.type · #data.number],
      )
      v(2mm)
      line(length: 100%, stroke: 0.6pt + hairline)
      v(2mm)
      grid(
        columns: (1fr, 17mm, 25mm, 28mm),
        column-gutter: 2mm,
        align: (left, right, right, right),
        text(font: "JetBrains Mono", size: 6.5pt, weight: 600, fill: muted)[DÉSIGNATION],
        text(font: "JetBrains Mono", size: 6.5pt, weight: 600, fill: muted)[QTÉ],
        text(font: "JetBrains Mono", size: 6.5pt, weight: 600, fill: muted)[PRIX UNIT.],
        text(font: "JetBrains Mono", size: 6.5pt, weight: 600, fill: muted)[MONTANT],
      )
    }
  },
  footer: context {
    set text(size: 6.8pt, fill: muted)
    grid(
      columns: (1fr, auto),
      align: (left, right),
      [#issuer-name#if present(field(issuer, "tax_id")) [ · NIF #field(issuer, "tax_id")]],
      [#data.number · #counter(page).display("1 / 1", both: true)],
    )
  },
)

#set text(font: "Inter Tight", size: 9pt, fill: ink, lang: "fr")
#set par(leading: 0.62em)

#let eyebrow(body) = text(font: "JetBrains Mono", size: 6.7pt, weight: 600, fill: muted, body)
#let label(body) = text(font: "JetBrains Mono", size: 6.5pt, weight: 600, fill: muted, body)

#grid(
  columns: (14mm, 1fr, auto),
  column-gutter: 4mm,
  align: (left, horizon),
  if usable-logo {
    box(width: 14mm, height: 14mm, inset: 0pt)[#image(issuer-logo, width: 14mm, height: 14mm, fit: "contain")]
  } else {
    box(width: 14mm, height: 14mm, fill: accent, inset: 0pt)[
      #align(center + horizon)[#text(size: 10pt, weight: 700, fill: accent-ink)[#issuer-mark]]
    ]
  },
  [
    #if present(issuer-name) [#text(size: 14pt, weight: 750)[#issuer-name]]
    #if issuer-contact.len() > 0 [
      #v(-1pt)
      #text(size: 8pt, fill: muted)[#issuer-contact.join([ · ])]
    ]
    #if present(field(issuer, "email")) [
      #v(0.5pt)
      #text(size: 7pt, fill: muted)[#field(issuer, "email")]
    ]
  ],
  align(right)[
    #eyebrow(data.type)
    #v(1.5pt)
    #text(font: "JetBrains Mono", size: 9pt, weight: 700)[#data.number]
    #v(1pt)
    #text(size: 7.5pt, fill: muted)[Émis le #data.date]
  ],
)

#v(6mm)
#rect(width: 28mm, height: 1.4pt, fill: accent)
#v(7mm)

#let has-client = (field(client, "name"), field(client, "phone"), field(client, "address"), field(client, "tax_id")).any(present)
#let frame-cells = (
  ..if present(field(data, "validity_days")) {
    (text(size: 7.5pt, fill: muted)[Validité], text(size: 7.5pt, weight: 600)[#field(data, "validity_days") jours])
  } else { () },
  ..if present(field(data, "delivery")) {
    (text(size: 7.5pt, fill: muted)[Délai], text(size: 7.5pt, weight: 600)[#field(data, "delivery")])
  } else { () },
  ..if present(field(data, "site")) {
    (text(size: 7.5pt, fill: muted)[Chantier], text(size: 7.5pt, weight: 600)[#field(data, "site")])
  } else { () },
  ..if present(field(data, "origin")) and present(field(field(data, "origin"), "number")) {
    let origin = field(data, "origin")
    (text(size: 7.5pt, fill: muted)[#field(origin, "label", fallback: "Document source")], text(size: 7.5pt, weight: 600)[#field(origin, "number")])
  } else { () },
)
#let has-frame = frame-cells.len() > 0

#if has-client or has-frame {
  grid(
    columns: if has-client and has-frame { (1fr, 1fr) } else { (1fr,) },
    column-gutter: 16mm,
    ..if has-client {
      ([
        #label([DESTINATAIRE])
        #v(2.2pt)
        #if present(field(client, "name")) [#text(size: 11pt, weight: 650)[#field(client, "name")]]
        #if present(field(client, "address")) [
          #v(1pt)
          #text(size: 8pt, fill: muted)[#field(client, "address")]
        ]
        #if present(field(client, "phone")) [
          #v(1pt)
          #text(size: 8pt, fill: muted)[#field(client, "phone")]
        ]
        #if present(field(client, "tax_id")) [
          #v(1pt)
          #text(size: 7.2pt, fill: muted)[NIF #field(client, "tax_id")]
        ]
      ],)
    } else { () },
    ..if has-frame {
      ([
        #label([CADRE])
        #v(2.2pt)
        #grid(
          columns: (auto, 1fr),
          column-gutter: 3mm,
          row-gutter: 2.2mm,
          ..frame-cells,
        )
      ],)
    } else { () },
  )
}

#v(7mm)
#if present(field(data, "object")) or present(field(data, "summary")) [
  #block(
    width: 100%,
    fill: soft,
    stroke: (left: 2pt + accent),
    inset: (x: 4mm, y: 3.2mm),
  )[
    #if present(field(data, "object")) [
      #label([OBJET])
      #v(2pt)
      #text(size: 12.5pt, weight: 700)[#field(data, "object")]
    ]
    #if present(field(data, "summary")) [
      #v(2pt)
      #text(size: 8pt, fill: muted)[#field(data, "summary")]
    ]
  ]
]

#v(7mm)
#grid(
  columns: (1fr, 17mm, 25mm, 28mm),
  column-gutter: 2mm,
  inset: (y: 2.2mm),
  align: (left, right, right, right),
  stroke: (bottom: 0.7pt + hairline),
  label([DÉSIGNATION]),
  label([QTÉ]),
  label([PRIX UNIT.]),
  label([MONTANT]),
)

#for section in sections {
  let title = field(section, "title")
  if title != none {
    v(3.5mm)
    grid(
      columns: (1fr, auto),
      align: (left, right),
      text(size: 8pt, weight: 700)[#title],
      eyebrow([SECTION]),
    )
    v(1.2mm)
  }

  for line in section.lines {
    let line-amount = field(line, "line_amount")
    let quantity = field(line, "quantity")
    let unit-price = field(line, "unit_price")
    grid(
      columns: (1fr, 17mm, 25mm, 28mm),
      column-gutter: 2mm,
      inset: (y: 2.5mm),
      align: (left, right, right, right),
      stroke: (bottom: 0.45pt + hairline),
      [
        #text(size: 8.5pt, weight: 520)[#line.label]
        #if field(line, "description") != none [
          #v(0.8pt)
          #text(size: 7.2pt, fill: muted)[#line.description]
        ]
      ],
      if present(quantity) { text(size: 7.8pt)[#quantity#if present(field(line, "unit")) [ #field(line, "unit")]] } else { text(fill: muted)[—] },
      if present(unit-price) { text(font: "JetBrains Mono", size: 7.4pt)[#format-number(unit-price)] } else { text(fill: muted)[—] },
      if present(line-amount) { text(font: "JetBrains Mono", size: 7.8pt, weight: 600)[#format-number(line-amount)] } else { [] },
    )
  }

  if field(section, "show_subtotal", fallback: false) and present(field(section, "subtotal")) {
    let subtotal-title = if title == none { "POSTES" } else { upper(title) }
    grid(
      columns: (1fr, auto),
      inset: (top: 1.8mm),
      align: (left, right),
      label([SOUS-TOTAL #subtotal-title]),
      text(font: "JetBrains Mono", size: 7.8pt, weight: 650)[#money(field(section, "subtotal"))],
    )
  }
}

#v(6mm)
#grid(
  columns: (1fr, 72mm),
  column-gutter: 10mm,
  [
    #if conditions.len() > 0 [
      #label([CONDITIONS])
      #v(2mm)
      #for condition in conditions {
        let condition-body = if type(condition) == dictionary { field(condition, "body") } else { condition }
        if present(condition-body) {
          grid(columns: (3mm, 1fr), [#text(fill: accent)[•]], text(size: 7.7pt, fill: muted)[#condition-body])
          v(1.2mm)
        }
      }
    ]
  ],
  [
    #grid(
      columns: (1fr, auto),
      row-gutter: 2.2mm,
      align: (left, right),
      ..adjustments.filter(adjustment => present(field(adjustment, "amount"))).map(adjustment => (
        text(size: 8pt, fill: muted)[#field(adjustment, "label", fallback: "Ajustement")#if field(adjustment, "mode") == "percent" and present(field(adjustment, "value")) [ (#field(adjustment, "value") %)]],
        text(font: "JetBrains Mono", size: 7.8pt)[#money(field(adjustment, "amount"))],
      )).flatten(),
      ..if present(tax-amount) {
        (
          text(size: 8pt, fill: muted)[TVA#if present(tax-rate) [ (#tax-rate %)]], text(font: "JetBrains Mono", size: 7.8pt)[#money(tax-amount)],
        )
      } else { () },
    )
    #v(3mm)
    #block(width: 100%, fill: accent, inset: (x: 4mm, y: 3.5mm))[
      #grid(
        columns: (1fr, auto),
        align: (left, right),
        text(size: 8pt, weight: 650, fill: white)[#field(data, "total_label", fallback: if tax-rate == none { [TOTAL GÉNÉRAL] } else { [TOTAL TTC] })],
        text(font: "JetBrains Mono", size: 13pt, weight: 750, fill: white)[#money(grand-total, color: white)],
      )
    ]
    #if present(deposit-requested) [
      #v(2.5mm)
      #grid(
        columns: (1fr, auto),
        row-gutter: 1.8mm,
        align: (left, right),
        text(size: 7.7pt, fill: muted)[Acompte#if present(deposit-percent) [ (#deposit-percent %)]],
        text(font: "JetBrains Mono", size: 7.6pt)[#money(deposit-requested)],
      )
      #if present(indicative-after-deposit) [
        #v(1.5mm)
        #grid(
          columns: (1fr, auto),
          align: (left, right),
          text(size: 7.7pt, fill: muted)[Solde indicatif],
          text(font: "JetBrains Mono", size: 7.6pt)[#money(indicative-after-deposit)],
        )
      ]
    ]
    #if payments.len() > 0 [
      #v(2.5mm)
      #grid(
        columns: (1fr, auto),
        row-gutter: 1.8mm,
        align: (left, right),
        ..payments.filter(payment => present(field(payment, "amount"))).map(payment => (
          text(size: 7.7pt, fill: muted)[Payé#if present(field(payment, "method")) [ · #field(payment, "method")]],
          text(font: "JetBrains Mono", size: 7.6pt)[#money(field(payment, "amount"))],
        )).flatten(),
        ..if present(paid-total) {
          (text(size: 7.7pt, fill: muted)[Total payé], text(font: "JetBrains Mono", size: 7.6pt)[#money(paid-total)])
        } else { () },
        ..if present(balance-due) {
          (text(size: 7.7pt, weight: 650)[Solde restant], text(font: "JetBrains Mono", size: 7.6pt, weight: 650)[#money(balance-due)])
        } else { () },
      )
    ]
  ],
)

#v(1fr)
#line(length: 100%, stroke: 0.6pt + hairline)
#v(3mm)
#grid(
  columns: (1fr, 1fr),
  column-gutter: 14mm,
  [
    #label(field(data, "signature_label", fallback: [BON POUR ACCORD]))
    #v(2pt)
    #text(size: 7pt, fill: muted)[#field(data, "signature_hint", fallback: [Date, nom et signature du client])]
  ],
  align(right)[
    #label([ÉMETTEUR])
    #v(2pt)
    #text(size: 7pt, fill: muted)[#issuer-name]
    #if present(field(issuer, "rccm")) [
      #v(1pt)
      #text(size: 6.5pt, fill: muted)[RCCM #field(issuer, "rccm")]
    ]
    #if present(field(issuer, "nif")) [
      #v(1pt)
      #text(size: 6.5pt, fill: muted)[NIF #field(issuer, "nif")]
    ]
    #if present(field(issuer, "mentions")) [
      #v(1pt)
      #text(size: 6.5pt, fill: muted)[#field(issuer, "mentions")]
    ]
  ],
)
