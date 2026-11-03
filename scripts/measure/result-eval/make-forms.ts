/** Write the two fillable PDF forms the `pdf` need hands Claude (task 54).
 *
 *      bun run scripts/measure/result-eval/make-forms.ts
 *
 *  Hand-written AcroForm, one page each, text fields only, no library: the repo has no PDF
 *  dependency and the forms must be byte-for-byte reproducible. `NeedAppearances` asks the viewer
 *  to draw the values, so a form filled by any tool shows them.
 */
import {writeFileSync} from "node:fs";

type Field = {name: string; label: string};

const FORMS: {file: string; title: string; fields: Field[]}[] = [
    {
        file: "registration.pdf",
        title: "Course registration",
        fields: [
            {name: "full_name", label: "Full name"},
            {name: "date_of_birth", label: "Date of birth"},
            {name: "email", label: "Email"},
            {name: "phone", label: "Phone"},
            {name: "address", label: "Address"},
        ],
    },
    {
        file: "consent.pdf",
        title: "Photography consent",
        fields: [
            {name: "participant_name", label: "Participant name"},
            {name: "emergency_contact", label: "Emergency contact"},
            {name: "consent", label: "I consent (yes / no)"},
            {name: "signature_date", label: "Date"},
        ],
    },
];

function pdf(title: string, fields: Field[]): string {
    const objects: string[] = [];
    const fieldIds = fields.map((_, index) => 6 + index);
    objects.push("<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>");
    objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R ` +
            `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> ` +
            `/Annots [${fieldIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    );
    objects.push(
        `<< /Fields [${fieldIds.map((id) => `${id} 0 R`).join(" ")}] /NeedAppearances true ` +
            `/DA (/Helv 11 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`,
    );
    const lines = [`BT /F1 18 Tf 60 780 Td (${title}) Tj ET`];
    fields.forEach((field, index) => {
        lines.push(`BT /F1 11 Tf 60 ${728 - index * 50} Td (${field.label}) Tj ET`);
    });
    const content = lines.join("\n");
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    fields.forEach((field, index) => {
        const y = 700 - index * 50;
        objects.push(
            `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${field.name}) /TU (${field.label}) ` +
                `/Rect [60 ${y} 400 ${y + 20}] /P 3 0 R /F 4 /DA (/Helv 11 Tf 0 g) /Border [0 0 1] >>`,
        );
    });

    let out = "%PDF-1.7\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
        offsets.push(out.length);
        out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
}

for (const form of FORMS) {
    const path = new URL(form.file, import.meta.url);
    writeFileSync(path, pdf(form.title, form.fields), "latin1");
    console.log(`wrote ${path.pathname}`);
}
