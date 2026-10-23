//! The canonical world: catalogs, demo rangers, rooms, quests and content.
//!
//! Everything here goes through the `Game` facade. The seed only runs when no
//! snapshot exists; afterwards the serialized `GameState` is the source of
//! truth and this module is never re-applied.

use std::collections::BTreeMap;

use taixu::prelude::*;

pub const SAVANNA: &str = "savanna";
pub const WETLAND: &str = "wetland";

pub const BOB: &str = "ranger_abo";
pub const MIRA: &str = "ranger_mira";
pub const KENJI: &str = "ranger_kenji";

pub const GUIDE_SAVANNA: &str = "guide_savanna";
pub const GUIDE_WETLAND: &str = "guide_wetland";

pub const SHOP: &str = "camp_shop";
pub const PHOTO_BOARD: &str = "photographers";
pub const RANGER_BOARD: &str = "rangers";
pub const TOUR_BOARD: &str = "guided_tours";
pub const ALBUM: &str = "safari_album";

#[derive(Clone, Copy, Debug)]
pub struct SpeciesMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub region: &'static str,
    pub photo_item: &'static str,
    pub score: i64,
    pub coins: u64,
    pub rarity: Rarity,
}

/// Every photographable animal. The frontend mirrors this table.
pub const SPECIES: [SpeciesMeta; 7] = [
    SpeciesMeta {
        id: "lion",
        name: "狮子",
        region: SAVANNA,
        photo_item: "photo_lion",
        score: 18,
        coins: 10,
        rarity: Rarity::Rare,
    },
    SpeciesMeta {
        id: "giraffe",
        name: "长颈鹿",
        region: SAVANNA,
        photo_item: "photo_giraffe",
        score: 15,
        coins: 8,
        rarity: Rarity::Rare,
    },
    SpeciesMeta {
        id: "zebra",
        name: "斑马",
        region: SAVANNA,
        photo_item: "photo_zebra",
        score: 12,
        coins: 7,
        rarity: Rarity::Uncommon,
    },
    SpeciesMeta {
        id: "rhino",
        name: "犀牛",
        region: SAVANNA,
        photo_item: "photo_rhino",
        score: 20,
        coins: 11,
        rarity: Rarity::Rare,
    },
    SpeciesMeta {
        id: "elephant",
        name: "大象",
        region: WETLAND,
        photo_item: "photo_elephant",
        score: 22,
        coins: 12,
        rarity: Rarity::Epic,
    },
    SpeciesMeta {
        id: "flamingo",
        name: "火烈鸟",
        region: WETLAND,
        photo_item: "photo_flamingo",
        score: 14,
        coins: 8,
        rarity: Rarity::Uncommon,
    },
    SpeciesMeta {
        id: "hippo",
        name: "河马",
        region: WETLAND,
        photo_item: "photo_hippo",
        score: 16,
        coins: 9,
        rarity: Rarity::Rare,
    },
];

pub fn species(id: &str) -> Option<&'static SpeciesMeta> {
    SPECIES.iter().find(|meta| meta.id == id)
}

pub fn region_name(region: &str) -> &'static str {
    match region {
        SAVANNA => "金合欢草原",
        WETLAND => "湿地河谷",
        _ => "未知园区",
    }
}

pub fn seed(game: &Game) -> GameResult<()> {
    // ---------------------------------------------------------------- regions
    game.create_region(
        SAVANNA,
        "金合欢草原",
        Some(500),
        Some("savanna.taixu.example".into()),
    )?;
    game.create_region(
        WETLAND,
        "湿地河谷",
        Some(500),
        Some("wetland.taixu.example".into()),
    )?;

    // ------------------------------------------------------------------ items
    let items = [
        ItemDef::new("film", "胶片")
            .with_description("老式相机的一卷胶片，拍摄时消耗 1 张。")
            .with_stack_limit(99),
        ItemDef::new("snack", "动物零食")
            .with_description("营地厨房特制的草食/肉食通用小点心。")
            .with_stack_limit(99),
        ItemDef::new("vintage_map", "阿宝的珍藏地图")
            .with_description("手绘的走私路线图，据说标注了所有水塘。")
            .with_rarity(Rarity::Legendary)
            .unique(),
        ItemDef::new("wetland_binoculars", "湿地望远镜")
            .with_description("湿地限定纪念品，观察火烈鸟的利器。")
            .with_rarity(Rarity::Epic)
            .unique(),
    ];
    for item in items {
        game.register_item(item)?;
    }
    for meta in SPECIES {
        game.register_item(
            ItemDef::new(meta.photo_item, format!("{}照片", meta.name))
                .with_description(format!(
                    "在{}拍到的一张{}照片，可以放进图鉴，也可以拿去和别的巡护员交换。",
                    region_name(meta.region),
                    meta.name
                ))
                .with_rarity(meta.rarity)
                .with_stack_limit(99)
                .with_tag("photo"),
        )?;
    }

    // -------------------------------------------------------------- resources
    game.register_resource(
        ResourceDef::new("battery", "相机电量")
            .with_cap(100)
            .with_regen_per_hour(24),
    )?;

    // ----------------------------------------------------------------- skins
    game.register_skin(
        SkinDef::new("explorer_hat", "探险帽", SkinCategory::Character)
            .with_description("一顶被晒得褪色的宽檐帽，戴上它就像个真正的巡护员。")
            .with_rarity(Rarity::Rare),
    )?;
    game.register_skin(
        SkinDef::new("safari_frame", "金合欢相框", SkinCategory::Frame)
            .with_description("相片墙上最受欢迎的金色相框。")
            .with_rarity(Rarity::Rare),
    )?;
    game.register_skin(
        SkinDef::new("safari_badge", "巡护员徽章", SkinCategory::Badge)
            .with_description("由向导亲手别上的铜质徽章。")
            .with_rarity(Rarity::Uncommon),
    )?;

    // ---------------------------------------------------------------- accounts
    seed_ranger(game, BOB, "阿宝", SAVANNA, 5, 420, 12)?;
    seed_ranger(game, MIRA, "米拉", WETLAND, 6, 530, 18)?;
    seed_ranger(game, KENJI, "健二", SAVANNA, 3, 260, 9)?;

    game.add_item(&BOB.into(), &"vintage_map".into(), 1)?;
    game.add_item(&BOB.into(), &"film".into(), 8)?;
    game.add_item(&BOB.into(), &"snack".into(), 4)?;
    game.add_currency(&BOB.into(), &"coins".into(), 240)?;
    game.update_avatar(
        &BOB.into(),
        Avatar {
            title: Some("吉普车电台台长".into()),
            ..Avatar::default()
        },
    )?;

    // ------------------------------------------------------------------ rooms
    let savanna_room = game.create_room(
        &BOB.into(),
        "吉普车电台 · 草原",
        &SAVANNA.into(),
        8,
        BTreeMap::from([
            ("topic".into(), "约拍、换照片、聊动物".into()),
            ("channel".into(), "通道 7".into()),
        ]),
    )?;
    game.send_system_message(
        ChatChannel::Room(savanna_room.id.clone()),
        "📻 这里全天的电台都开着。阿宝会把最新的动物出没消息贴在这里。",
    )?;
    game.send_message(
        &BOB.into(),
        ChatChannel::Room(savanna_room.id.clone()),
        "早上好，巡护员！东边水塘今天来了三头犀牛，带上胶片去看看吧。",
    )?;

    let wetland_room = game.create_room(
        &MIRA.into(),
        "观鸟塔电台 · 湿地",
        &WETLAND.into(),
        8,
        BTreeMap::from([("topic".into(), "火烈鸟与河马的日常".into())]),
    )?;
    game.send_system_message(
        ChatChannel::Room(wetland_room.id.clone()),
        "📻 观鸟塔的电波穿过芦苇荡。米拉正在记录今天的鸟群。",
    )?;
    game.send_message(
        &MIRA.into(),
        ChatChannel::Room(wetland_room.id.clone()),
        "西岸的浅滩有火烈鸟群，别穿太鲜艳的衣服，慢慢靠近。",
    )?;

    // ------------------------------------------------------------------ shop
    let mut shop = Shop::new(SHOP, "营地补给站")
        .with_description("用摄影赚来的金币补给胶片、零食和电量，也能淘到限定纪念品。");
    shop.add_offer(
        ShopOffer::new(
            "film_pack",
            "胶片 ×4",
            Cost::new().currency("coins", 40),
            Reward::new().item("film", 4),
        )
        .with_description("一包四卷胶片，足够把这个下午拍满。")
        .with_per_account_limit(20)
        .with_tag("supply"),
    )?;
    shop.add_offer(
        ShopOffer::new(
            "snack_pack",
            "动物零食 ×3",
            Cost::new().currency("coins", 30),
            Reward::new().item("snack", 3),
        )
        .with_description("营地厨房烤的，动物们闻味道就会走过来。")
        .with_per_account_limit(20)
        .with_tag("supply"),
    )?;
    shop.add_offer(
        ShopOffer::new(
            "battery_pack",
            "备用电池 · 40 电",
            Cost::new().currency("coins", 25),
            Reward::new().resource("battery", 40),
        )
        .with_description("最怕快门按下的一刻相机没电。")
        .with_per_account_limit(20)
        .with_tag("supply"),
    )?;
    shop.add_offer(
        ShopOffer::new(
            "explorer_hat",
            "探险帽",
            Cost::new().currency("coins", 150),
            Reward::new().skin("explorer_hat"),
        )
        .with_description("园区限定外观。戴上它，向导会对你更热情一点。")
        .with_per_account_limit(1)
        .with_tag("featured"),
    )?;
    shop.add_offer(
        ShopOffer::new(
            "safari_frame",
            "金合欢相框",
            Cost::new().currency("coins", 200),
            Reward::new().skin("safari_frame"),
        )
        .with_description("给自己的档案照片换一个金色相框。")
        .with_per_account_limit(1),
    )?;
    shop.add_offer(
        ShopOffer::new(
            "wetland_scope",
            "湿地望远镜",
            Cost::new().currency("coins", 120),
            Reward::new().item("wetland_binoculars", 1),
        )
        .with_description("湿地河谷限定纪念品，限量发售。")
        .with_regions([WETLAND.into()])
        .with_stock(5)
        .with_tag("regional"),
    )?;
    game.register_shop(shop)?;

    // ------------------------------------------------------------ achievements
    let achievements = [
        AchievementDef::new(
            "first_photo",
            "第一张照片",
            "photos",
            1,
            Reward::new().currency("coins", 40),
        )
        .with_description("按下第一次快门。"),
        AchievementDef::new(
            "shutterbug",
            "快门狂人",
            "photos",
            10,
            Reward::new().currency("coins", 120).item("film", 5),
        )
        .with_description("拍摄 10 张动物照片。"),
        AchievementDef::new(
            "species_collector",
            "五兽图鉴",
            "species_photos",
            5,
            Reward::new().currency("coins", 200).skin("safari_frame"),
        )
        .with_description("拍到五种不同的动物。"),
        AchievementDef::new(
            "feeder",
            "动物之友",
            "feeds",
            5,
            Reward::new().currency("coins", 100),
        )
        .with_description("投喂动物 5 次。"),
        AchievementDef::new(
            "safari_master",
            "太虚摄影大师",
            "photos",
            25,
            Reward::new().currency("coins", 500).xp(200),
        )
        .with_description("拍摄 25 张照片，把整个园区收进取景框。"),
        AchievementDef::new(
            "first_feed",
            "第一次亲密接触",
            "feeds",
            1,
            Reward::new().currency("coins", 20),
        )
        .hidden()
        .with_description("第一次投喂动物（隐藏成就）。"),
    ];
    for achievement in achievements {
        game.register_achievement(achievement)?;
    }

    // ------------------------------------------------------------------ tasks
    game.register_task(
        TaskDef::new("welcome_photo", "欢迎来到园区")
            .with_description("向导说：先拍一张照片，让我看看你的构图。")
            .with_category("main")
            .with_objective(TaskObjective::metric("photos", 1))
            .with_reward(Reward::new().currency("coins", 30).item("film", 2)),
    )?;
    game.register_task(
        TaskDef::new("daily_safari", "每日巡护 · 三张照片")
            .with_description("每天拍下三张动物照片，营地会报销胶片。")
            .with_category("daily")
            .with_objective(TaskObjective::metric("photos", 3))
            .with_reward(Reward::new().currency("coins", 60).item("film", 3))
            .with_repeat(TaskRepeat::daily())
            .with_time_limit_ms(24 * 3_600_000),
    )?;
    game.register_task(
        TaskDef::new("close_up", "近身特写")
            .with_description("完成欢迎任务、升到 2 级后，再拍 6 张照片。")
            .with_category("main")
            .with_objective(TaskObjective::metric("photos", 6))
            .with_reward(Reward::new().currency("coins", 120).skin("safari_badge"))
            .with_prerequisite("welcome_photo")
            .with_min_level(2),
    )?;
    game.register_task(
        TaskDef::new("feed_friends", "营地下午茶")
            .with_description("带着至少 1 份动物零食，投喂动物 2 次。")
            .with_category("daily")
            .with_objective(TaskObjective::metric("feeds", 2))
            .with_objective(TaskObjective::item("snack", 1))
            .with_reward(Reward::new().currency("coins", 45)),
    )?;
    game.register_task(
        TaskDef::new("dress_up", "像个巡护员")
            .with_description("在补给站买一顶探险帽并戴上它。")
            .with_category("style")
            .with_objective(TaskObjective::skin("explorer_hat"))
            .with_reward(Reward::new().currency("coins", 50).xp(40)),
    )?;
    game.register_task(
        TaskDef::new("five_kinds", "五兽巡礼")
            .with_description("解锁「五兽图鉴」成就后回营地复命。")
            .with_category("main")
            .with_objective(TaskObjective::achievement("species_collector"))
            .with_reward(Reward::new().currency("coins", 150).item("film", 4)),
    )?;
    game.register_task(
        TaskDef::new("night_owl", "夜行的镜头")
            .with_description("再拍 8 张照片，你开始习惯草原的节奏了。（隐藏任务）")
            .with_category("main")
            .with_objective(TaskObjective::metric("photos", 8))
            .with_reward(Reward::new().currency("coins", 80))
            .hidden(),
    )?;

    // ------------------------------------------------------------- collection
    game.register_collection(
        CollectionDef::new(ALBUM, "太虚动物图鉴")
            .with_description("收集园区里每一种动物的照片、限定纪念品与巡护员外观。")
            .with_entries([
                Collectible::Item("photo_lion".into()),
                Collectible::Item("photo_giraffe".into()),
                Collectible::Item("photo_zebra".into()),
                Collectible::Item("photo_rhino".into()),
                Collectible::Item("photo_elephant".into()),
                Collectible::Item("photo_flamingo".into()),
                Collectible::Item("photo_hippo".into()),
                Collectible::Item("vintage_map".into()),
                Collectible::Item("wetland_binoculars".into()),
                Collectible::Skin("explorer_hat".into()),
                Collectible::Achievement("first_photo".into()),
            ])
            .with_milestones([
                CollectionMilestone::new(3, Reward::new().currency("coins", 100).item("film", 3)),
                CollectionMilestone::new(6, Reward::new().currency("coins", 200)),
                CollectionMilestone::new(
                    9,
                    Reward::new().currency("coins", 300).skin("safari_badge"),
                ),
                CollectionMilestone::new(
                    11,
                    Reward::new()
                        .currency("coins", 500)
                        .skin("safari_frame")
                        .xp(150),
                ),
            ]),
    )?;

    // ------------------------------------------------------------ leaderboards
    game.register_leaderboard(
        Leaderboard::new(PHOTO_BOARD, "本月摄影积分", ScoreOrder::HigherIsBetter)
            .with_description("每拍到一种动物都会计入积分，稀有动物分数更高。")
            .with_max_entries(100),
    )?;
    game.register_leaderboard(
        Leaderboard::new(RANGER_BOARD, "投喂榜", ScoreOrder::HigherIsBetter)
            .with_description("谁最受动物欢迎？")
            .with_max_entries(100),
    )?;
    game.register_leaderboard(
        Leaderboard::new(TOUR_BOARD, "向导好感度", ScoreOrder::HigherIsBetter)
            .with_description("向导记得每一个认真听讲的人。")
            .with_max_entries(100),
    )?;
    for (account, score) in [(BOB, 180_i64), (MIRA, 260_i64), (KENJI, 140_i64)] {
        game.set_leaderboard_score(&PHOTO_BOARD.into(), &account.into(), score)?;
        game.set_leaderboard_score(&RANGER_BOARD.into(), &account.into(), score / 12)?;
    }
    game.set_leaderboard_score(&TOUR_BOARD.into(), &BOB.into(), 30)?;

    // ----------------------------------------------------------- announcements
    game.publish_announcement(
        AnnouncementDraft::new(
            "欢迎来到太虚野生动物园",
            "用 WASD 巡游园区，靠近动物后按 E 拍照、按 F 投喂。照片可以放进图鉴，也能拿去和电台台长阿宝交换珍藏地图。",
        )
        .with_kind(AnnouncementKind::Event)
        .with_priority(10),
    )?;
    game.publish_announcement(
        AnnouncementDraft::new(
            "湿地观鸟季",
            "湿地河谷的火烈鸟群已经抵达。湿地补给站上架了望远镜，限量 5 件。",
        )
        .with_kind(AnnouncementKind::Promotion)
        .with_priority(6)
        .with_regions([WETLAND.into()]),
    )?;
    let now = game.now_ms();
    game.publish_announcement(
        AnnouncementDraft::new(
            "日落摄影时刻",
            "每天最后两小时光线最暖。犀牛和大象在逆光里轮廓最好看，记得留一卷胶片。",
        )
        .with_kind(AnnouncementKind::Event)
        .with_priority(8)
        .with_window(Some(now - 3_600_000), Some(now + 3 * 86_400_000)),
    )?;
    game.publish_announcement(
        AnnouncementDraft::new(
            "摄影大赛征集中",
            "本月摄影积分榜前三名会被写进园区年报。稀有动物照片得分更高，别忘了拍犀牛和大象。",
        )
        .with_kind(AnnouncementKind::News)
        .with_priority(3),
    )?;

    // ------------------------------------------------------------------- NPCs
    game.register_npc(
        NpcDef::new(
            GUIDE_SAVANNA,
            "向导·长安",
            "金合欢草原的老巡护员，晒得黝黑，说话慢条斯理，熟悉每一头动物。",
        )
        .in_region(SAVANNA)
        .with_greeting("欢迎来到草原。风从北边来的时候，犀牛会去东边的水塘。"),
    )?;
    game.register_npc(
        NpcDef::new(
            GUIDE_WETLAND,
            "向导·鹭",
            "湿地河谷的观鸟人，安静、好奇，喜欢用比喻描述火烈鸟的羽毛。",
        )
        .in_region(WETLAND)
        .with_greeting("嘘——看那边，粉色的是火烈鸟，灰色的是还没长大的小家伙。"),
    )?;

    // Seed one NPC-authored message on each regional channel. `send_npc_message`
    // writes with the NPC author tag and validates the NPC/channel binding.
    game.send_npc_message(
        &GUIDE_SAVANNA.into(),
        ChatChannel::Region(SAVANNA.into()),
        "电台试音：金合欢草原，一切正常。需要拍照建议就来找我。",
    )?;
    game.send_npc_message(
        &GUIDE_WETLAND.into(),
        ChatChannel::Region(WETLAND.into()),
        "观鸟塔报告：浅滩的火烈鸟群今天很安静，适合慢慢靠近。",
    )?;

    Ok(())
}

fn seed_ranger(
    game: &Game,
    id: &str,
    name: &str,
    region: &str,
    level: u32,
    xp: u64,
    score_coins: u64,
) -> GameResult<()> {
    let account = game.ensure_account(id, name, region)?;
    game.set_level(&account.id, level)?;
    game.add_xp(&account.id, xp)?;
    game.add_currency(&account.id, &"coins".into(), score_coins * 10)?;
    game.set_resource(&account.id, &"battery".into(), 100)?;
    game.login(&account.id)?;
    Ok(())
}
