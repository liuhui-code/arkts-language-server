import { Profile } from "./Api"

const emojiMarker = "😀"; const selected: Profile = {
  displayName: "Ada",
}

export function titleOf(profile: Profile): string {
  const copy: Profile = profile
  return copy.displayName
}

function shadowedName(): string {
  const Profile = "local shadow"
  return Profile
}
