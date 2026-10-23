//! A deterministic, offline NPC agent for the two park guides.
//!
//! It exercises every structured NPC action: `Say`, `GiveReward` and
//! `SetScore`. Rewards are rate-limited on the host side, which is exactly the
//! responsibility the taixu docs assign to the host.

use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;
use taixu::npc::NpcError;
use taixu::prelude::*;

use crate::seed::{SPECIES, TOUR_BOARD};

#[derive(Clone, Copy, Debug)]
pub enum GuideKind {
    Savanna,
    Wetland,
}

pub struct GuideAgent {
    kind: GuideKind,
    /// account id -> last gift time (Unix ms)
    last_gift: Mutex<HashMap<String, i64>>,
}

impl GuideAgent {
    pub fn new(kind: GuideKind) -> Self {
        Self {
            kind,
            last_gift: Mutex::new(HashMap::new()),
        }
    }

    fn animal_tip(&self) -> &'static str {
        match self.kind {
            GuideKind::Savanna => {
                "狮子喜欢趴在金合欢的阴影里，犀牛则在东边水塘附近。走近到十步以内再按 E。"
            }
            GuideKind::Wetland => {
                "火烈鸟总在浅滩上排成一排，河马过了中午才上岸。镜头上如果有水汽，用衣角擦一擦。"
            }
        }
    }
}

#[async_trait]
impl NpcAgent for GuideAgent {
    async fn respond(&self, context: &NpcContext) -> Result<NpcDecision, NpcError> {
        let text = context.message.to_lowercase();
        let mut actions = Vec::new();
        let reply;

        if text.contains("礼物") || text.contains("奖励") || text.contains("gift") {
            let cooldown_ms = 10 * 60 * 1_000;
            let now = context.now_ms;
            let mut gifts = self
                .last_gift
                .lock()
                .map_err(|_| NpcError::agent("guide gift lock poisoned"))?;
            let last = gifts.get(context.speaker.as_str()).copied();
            if last.is_some_and(|last| now - last < cooldown_ms) {
                reply = format!("{}刚给过你一份营地补贴，等一会儿再来吧。", context.npc.name);
            } else {
                gifts.insert(context.speaker.as_str().to_owned(), now);
                actions.push(NpcAction::GiveReward {
                    account: context.speaker.clone(),
                    reward: Reward::new().currency("coins", 20).item("film", 1),
                });
                actions.push(NpcAction::SetScore {
                    leaderboard: TOUR_BOARD.into(),
                    account: context.speaker.clone(),
                    score: 100,
                });
                reply =
                    "拿好，这是营地的一点心意：20 金币和一卷胶片。顺便，我也把你记进了向导好感度榜。"
                        .into();
            }
        } else if text.contains("任务") || text.contains("quest") {
            reply = "营地公告板上有任务。欢迎任务是拍下第一张照片；每日巡护每天都能领一次；升到 2 级后还有近身特写。".into();
        } else if text.contains("拍") || text.contains("相机") || text.contains("photo") {
            actions.push(NpcAction::Say {
                text: format!("小贴士：{}", self.animal_tip()),
            });
            reply =
                "每按一次快门消耗 1 卷胶片和 5 点相机电量。电力会自己慢慢恢复，胶片要去补给站买。"
                    .into();
        } else if text.contains("阿宝") || text.contains("交易") || text.contains("地图") {
            reply = "阿宝在吉普车电台那间屋子里。他想要一张狮子照片和 30 金币，愿意拿珍藏地图来换——那东西也算图鉴条目。".into();
        } else if text.contains("图鉴") || text.contains("收集") {
            reply = "图鉴里有七种动物照片、两件纪念品、探险帽外观和「第一张照片」成就。集满 3、6、9、11 件时都有里程碑奖励。".into();
        } else if text.contains("排行") || text.contains("榜") {
            reply = "摄影积分看稀有度，投喂榜看次数，向导好感度则看我心情——开个玩笑，四处问问总能加分。".into();
        } else if text.contains("湿地") {
            reply = "湿地河谷有火烈鸟、河马和大象；草原这边则是狮子、长颈鹿、斑马和犀牛。园区切换在右上角档案里。".into();
        } else if text.contains("你好") || text.contains("hi") || text.contains("hello") {
            reply = match self.kind {
                GuideKind::Savanna => "你好，巡护员。今天风很稳，适合拍远处的东西。".into(),
                GuideKind::Wetland => "你好呀。慢一点走，水边的动物不喜欢突然出现的人。".into(),
            };
        } else {
            let species = SPECIES
                .iter()
                .filter(|meta| {
                    meta.region
                        == context
                            .npc
                            .region
                            .as_ref()
                            .map(|r| r.as_str())
                            .unwrap_or("")
                })
                .map(|meta| meta.name)
                .collect::<Vec<_>>()
                .join("、");
            reply = format!(
                "我在这里见过{}。想拍照就靠近一点，按 E；想投喂就按 F。也可以问我「任务」「图鉴」「阿宝」或者「礼物」。",
                species
            );
        }

        Ok(NpcDecision {
            reply: Some(reply),
            actions,
        })
    }
}
