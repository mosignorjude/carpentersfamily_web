export const clubBrand = {
  name: "Carpenters Family Social Club",
  shortName: "Carpenters Family",
  slogan: "One Family, Endless Vibes.",
  location: "Asaba, Delta State",
  description: "Private member portal for Carpenters Family Social Club.",
  logoSrc: "/brand/carpenters-family-mark.png",
  eventHeroSrc: "/brand/carpenters-family-event-hero.webp",
  logoAlt: "Carpenters Family logo",
  // The only two channels the club runs. Instagram is spelled @capenters_family
  // on purpose — that is how the handle was registered.
  socials: [
    {
      network: "TikTok",
      handle: "@carpenters_family",
      url: "https://www.tiktok.com/@carpenters_family",
    },
    {
      network: "Instagram",
      handle: "@capenters_family",
      url: "https://www.instagram.com/capenters_family",
    },
  ],
} as const;
