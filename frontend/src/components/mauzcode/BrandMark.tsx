/** The MauzCode brand mark: the canonical brand icon (src/ui/assets/icon.svg, copied to public/brand-icon.svg by script/generate-icons.ts), decorative next to the product name. */
export function BrandMark() {
  return <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand-icon.svg`} alt="" aria-hidden="true" draggable={false} />;
}
