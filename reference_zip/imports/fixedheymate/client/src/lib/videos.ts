// Static video library — all 17 archived Jumanne videos
// CDN-hosted MP4s uploaded from pinchflat/tmp/media

export interface Video {
  id: string;
  title: string;
  channel: string;
  date: string;
  url: string;
  durationLabel?: string;
}

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663539801223/24GUs4oxcqJjQnMUCXSU6r";

export const VIDEOS: Video[] = [
  {
    id: "dbaX16joLZY",
    title: "I Got CANCELLED From Subway!!!",
    channel: "Jumanne Alt",
    date: "2026-04-07",
    url: `${CDN}/I_Got_CANCELLED_From_Subway_8703ec51.mp4`,
  },
  {
    id: "6zUu-bppvTA",
    title: "Insecurities & Anti Social Behavior",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Insecurities_Anti_Social_Behavior_81505702.mp4`,
  },
  {
    id: "nVuq5WAAPlg",
    title: "I Got CANCELLED From Subway (Part 2)",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/I_Got_CANCELLED_From_Subway_Part2_e784e6c5.mp4`,
  },
  {
    id: "Rh_LgTVxDT4",
    title: "It's My Job To Expose Myself?!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Its_My_Job_To_Expose_Myself_e2f02df8.mp4`,
  },
  {
    id: "oRzUko3zZXQ",
    title: "I Don't Know Where To Go From Here?",
    channel: "Jumanne",
    date: "2026-04-02",
    url: `${CDN}/I_Dont_Know_Where_To_Go_003be41f.mp4`,
  },
  {
    id: "OQVx90FRFTw",
    title: "What It's Like Being Infamous: CVS, Pop Smoke, Subway Controversy",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/What_Its_Like_Being_Infamous_96548762.mp4`,
  },
  {
    id: "Ja_1sPnuZ5g",
    title: "The Reason I Stalk Women",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/The_Reason_I_Stalk_Women_494e5021.mp4`,
  },
  {
    id: "KV-oxuZ_III",
    title: "I'm Crazier Then What You Think I Am!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Im_Crazier_Then_What_You_Think_885bb400.mp4`,
  },
  {
    id: "L1C6iF3NEr8",
    title: "I Feel Like I Lost!!!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/I_Feel_Like_I_Lost_66ee6b67.mp4`,
  },
  {
    id: "rOUQKrvdfMk",
    title: "I Hate Who I'm Becoming!",
    channel: "Jumanne",
    date: "2026-04-08",
    url: `${CDN}/I_Hate_Who_Im_Becoming_4e79e639.mp4`,
  },
  {
    id: "UvgdruNXrNw",
    title: "I'm Not Sorry Natalie!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Im_Not_Sorry_Natalie_c3766c97.mp4`,
  },
  {
    id: "ijQc1P7cEqg",
    title: "Feel How You Want About Me!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Feel_How_You_Want_About_Me_8aeca907.mp4`,
  },
  {
    id: "a-20o36Pvx4",
    title: "It's Not About Me, But It Is!",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Its_Not_About_Me_But_It_Is_22a65804.mp4`,
  },
  {
    id: "P5ZgX8KLGmY",
    title: "Is Offset Really A Gambling Addict?",
    channel: "Jumanne",
    date: "2026-04-07",
    url: `${CDN}/Is_Offset_Really_A_Gambling_Addict_7084110f.mp4`,
  },
  {
    id: "utaKujZhaOE",
    title: "If I Make You Feel Better About Yourself, Your Welcome!",
    channel: "Jumanne Alt",
    date: "2026-04-07",
    url: `${CDN}/If_I_Make_You_Feel_Better_5d13f793.mp4`,
  },
  {
    id: "s-ORn82XMAY",
    title: "Jumanne: YouTube Revenue",
    channel: "Jumanne",
    date: "2026-04-08",
    url: `${CDN}/Jumanne_YouTube_Revenue_3ff577ac.mp4`,
  },
  {
    id: "g3xnlxJ5l0c",
    title: "Deleting………",
    channel: "Jumanne",
    date: "2026-04-04",
    url: `${CDN}/Deleting_ae6af94f.mp4`,
  },
];

export function getVideoById(id: string): Video | undefined {
  return VIDEOS.find((v) => v.id === id);
}
