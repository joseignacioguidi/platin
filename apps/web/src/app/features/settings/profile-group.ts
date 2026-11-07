/**
 * AUTH-10: a group of the profile. On a phone its title goes outside the card (small, uppercase);
 * from `lg` the whole group is the card, with the title inside. One heading either way.
 */
export const PROFILE_GROUP = {
  section: 'flex flex-col gap-2 lg:gap-4 lg:rounded-card lg:bg-surface lg:px-6 lg:py-5',
  title:
    'mx-2 mt-4 text-[13px] font-bold tracking-wider text-muted uppercase lg:m-0 lg:text-lg lg:font-extrabold lg:tracking-normal lg:text-ink lg:normal-case',
  body: 'flex flex-col gap-4 rounded-card bg-surface p-4 lg:rounded-none lg:bg-transparent lg:p-0',
} as const;
