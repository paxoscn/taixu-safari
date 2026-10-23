//! HTTP host layer. Authentication is intentionally a demo "trusted id":
//! taixu expects the gateway to authenticate and pass in a trusted AccountId.

use std::collections::BTreeMap;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use taixu::npc::NpcError;
use taixu::prelude::*;

use crate::guide::{GuideAgent, GuideKind};
use crate::seed::{self, SpeciesMeta, BOB, GUIDE_SAVANNA, GUIDE_WETLAND, SAVANNA, WETLAND};
use crate::AppState;

// ===========================================================================
// Errors
// ===========================================================================

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: String,
    message: String,
}

impl ApiError {
    fn bad(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: code.into(),
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({
                "ok": false,
                "error": { "code": self.code, "message": self.message }
            })),
        )
            .into_response()
    }
}

fn code_for(error: &GameError) -> &'static str {
    match error {
        GameError::AccountNotFound(_) => "ACCOUNT_NOT_FOUND",
        GameError::RegionNotOpen(_) => "REGION_NOT_OPEN",
        GameError::RegionFull(_) => "REGION_FULL",
        GameError::RoomFull(_) => "ROOM_FULL",
        GameError::RoomNotFound(_) => "ROOM_NOT_FOUND",
        GameError::InsufficientFunds { .. } => "INSUFFICIENT_FUNDS",
        GameError::InsufficientResources { .. } => "INSUFFICIENT_RESOURCES",
        GameError::InsufficientItems { .. } => "INSUFFICIENT_ITEMS",
        GameError::InventoryFull => "INVENTORY_FULL",
        GameError::OutOfStock => "OUT_OF_STOCK",
        GameError::OfferUnavailable => "OFFER_UNAVAILABLE",
        GameError::PurchaseLimitReached => "PURCHASE_LIMIT",
        GameError::TaskLocked(_) => "TASK_LOCKED",
        GameError::TaskOnCooldown { .. } => "TASK_COOLDOWN",
        GameError::TaskAlreadyAccepted(_)
        | GameError::TaskAlreadyCompleted(_)
        | GameError::TaskNotAccepted(_)
        | GameError::TaskNotCompleted(_)
        | GameError::TaskAlreadyClaimed(_) => "TASK_STATE",
        GameError::TradeExpired => "TRADE_EXPIRED",
        GameError::TradeAssetsUnavailable => "TRADE_ASSETS_UNAVAILABLE",
        GameError::TradeNotOpen => "TRADE_NOT_OPEN",
        GameError::MilestoneLocked => "MILESTONE_LOCKED",
        GameError::AlreadyClaimed => "ALREADY_CLAIMED",
        GameError::AchievementNotCompleted => "ACHIEVEMENT_NOT_COMPLETED",
        GameError::AchievementAlreadyClaimed => "ALREADY_CLAIMED",
        GameError::ContentTooLong { .. } => "CONTENT_TOO_LONG",
        GameError::EmptyContent => "EMPTY_CONTENT",
        GameError::ChannelAccessDenied(_) => "CHANNEL_DENIED",
        GameError::Blocked => "BLOCKED",
        GameError::SkinNotOwned(_) => "SKIN_NOT_OWNED",
        GameError::NotRoomOwner => "NOT_ROOM_OWNER",
        GameError::AlreadyFriends(_) => "ALREADY_FRIENDS",
        GameError::FriendRequestPending => "FRIEND_REQUEST_PENDING",
        GameError::Persistence(_) => "PERSISTENCE",
        _ => "GAME_ERROR",
    }
}

fn status_for(error: &GameError) -> StatusCode {
    match error {
        GameError::AccountNotFound(_)
        | GameError::RegionNotFound(_)
        | GameError::RoomNotFound(_)
        | GameError::TradeNotFound(_)
        | GameError::ShopNotFound(_)
        | GameError::OfferNotFound(_)
        | GameError::SkinNotFound(_)
        | GameError::CollectionNotFound(_)
        | GameError::LeaderboardNotFound(_)
        | GameError::AchievementNotFound(_)
        | GameError::TaskNotFound(_)
        | GameError::AnnouncementNotFound(_)
        | GameError::NpcNotFound(_) => StatusCode::NOT_FOUND,
        GameError::AlreadyFriends(_)
        | GameError::FriendRequestPending
        | GameError::AlreadyBlocked
        | GameError::AlreadyClaimed
        | GameError::TaskAlreadyAccepted(_)
        | GameError::TaskAlreadyCompleted(_)
        | GameError::TaskAlreadyClaimed(_)
        | GameError::AchievementAlreadyClaimed
        | GameError::RegionNotOpen(_)
        | GameError::RegionFull(_)
        | GameError::RoomFull(_) => StatusCode::CONFLICT,
        GameError::Blocked | GameError::ChannelAccessDenied(_) | GameError::NotRoomOwner => {
            StatusCode::FORBIDDEN
        }
        _ => StatusCode::BAD_REQUEST,
    }
}

impl From<GameError> for ApiError {
    fn from(error: GameError) -> Self {
        Self {
            status: status_for(&error),
            code: code_for(&error).to_owned(),
            message: error.to_string(),
        }
    }
}

impl From<NpcError> for ApiError {
    fn from(error: NpcError) -> Self {
        match error {
            NpcError::Game(error) => error.into(),
            other => ApiError::bad("NPC_ERROR", other.to_string()),
        }
    }
}

type ApiResult<T> = std::result::Result<T, ApiError>;
type JsonResult = ApiResult<Json<Value>>;

fn account_id(raw: &str) -> ApiResult<AccountId> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 80 {
        return Err(ApiError::bad("BAD_ACCOUNT", "缺少或非法的账号 ID"));
    }
    Ok(raw.into())
}

fn parse_channel(raw: &str) -> ApiResult<ChatChannel> {
    serde_json::from_value::<ChatChannel>(Value::String(raw.to_owned()))
        .map_err(|_| ApiError::bad("BAD_CHANNEL", "无法识别的聊天频道"))
}

fn parse_category(raw: &str) -> ApiResult<SkinCategory> {
    Ok(match raw {
        "character" => SkinCategory::Character,
        "weapon" => SkinCategory::Weapon,
        "avatar" => SkinCategory::Avatar,
        "frame" => SkinCategory::Frame,
        "badge" => SkinCategory::Badge,
        "background" => SkinCategory::Background,
        "emote" => SkinCategory::Emote,
        other => SkinCategory::Other(other.to_owned()),
    })
}

fn guide_for(region: &str) -> &'static str {
    if region == WETLAND {
        GUIDE_WETLAND
    } else {
        GUIDE_SAVANNA
    }
}

/// Persist after a mutation, then return the fresh aggregate state.
fn finish(app: &AppState, account: &AccountId, result: Value) -> JsonResult {
    if let Err(error) = app.store.save_game(&app.game) {
        tracing::warn!(%error, "snapshot save failed");
    }
    Ok(Json(json!({
        "ok": true,
        "state": state_json(app, account)?,
        "result": result,
    })))
}

// ===========================================================================
// Aggregate client state
// ===========================================================================

fn state_json(app: &AppState, account_id: &AccountId) -> ApiResult<Value> {
    let game = &app.game;
    let account = game.account(account_id)?;

    let people: Vec<Value> = game.with_state(|state| {
        state
            .accounts
            .values()
            .map(|account| {
                json!({
                    "id": account.id,
                    "name": account.display_name,
                    "level": account.level,
                    "region": account.region,
                    "online": account.online,
                    "title": account.avatar.title,
                })
            })
            .collect()
    });
    let names: BTreeMap<String, String> = people
        .iter()
        .filter_map(|person| {
            Some((
                person.get("id")?.as_str()?.to_owned(),
                person.get("name")?.as_str()?.to_owned(),
            ))
        })
        .collect();

    let wallet = game.wallet(account_id)?;
    let inventory = game.inventory(account_id)?;
    let tasks = game.task_views(account_id)?;
    let achievements = game.achievements_for(account_id)?;
    let owned_skins = game.owned_skins(account_id)?;
    let collection_def = game.collection(&seed::ALBUM.into())?;
    let collection_progress = game.collection_progress(account_id, &seed::ALBUM.into())?;

    let shops: Vec<Value> = game
        .shops()
        .iter()
        .map(|shop| {
            let offers: Vec<Value> = shop
                .offers
                .values()
                .map(|offer| {
                    json!({
                        "id": offer.id,
                        "name": offer.name,
                        "description": offer.description,
                        "cost": offer.cost,
                        "reward": offer.reward,
                        "per_account_limit": offer.per_account_limit,
                        "stock": offer.stock,
                        "sold": offer.sold,
                        "remaining_stock": offer.remaining_stock(),
                        "available_now": offer.available_at(game.now_ms(), &account.region),
                        "purchased": game.purchased_quantity(account_id, &shop.id, &offer.id),
                        "tags": offer.tags,
                    })
                })
                .collect();
            json!({
                "id": shop.id,
                "name": shop.name,
                "description": shop.description,
                "regions": shop.regions,
                "offers": offers,
            })
        })
        .collect();

    let leaderboards: Vec<Value> = game
        .leaderboards()
        .iter()
        .map(|board| {
            json!({
                "id": board.id,
                "name": board.name,
                "description": board.description,
                "order": board.order,
                "season": board.season,
                "top": game.leaderboard_top(&board.id, 10).unwrap_or_default(),
                "my_score": game.leaderboard_score(&board.id, account_id).unwrap_or(None),
                "my_rank": game.leaderboard_rank(&board.id, account_id).unwrap_or(None),
            })
        })
        .collect();

    let announcements: Vec<Value> = game
        .active_announcements(account_id)?
        .into_iter()
        .map(|announcement| {
            let read = game.is_announcement_read(account_id, &announcement.id);
            json!({ "announcement": announcement, "read": read })
        })
        .collect();
    let unread = game.unread_announcements(account_id)?.len();

    let rooms: Vec<Value> = game
        .rooms(Some(&account.region))
        .iter()
        .map(|room| {
            let members: Vec<String> = room
                .players
                .iter()
                .map(|id| names.get(id.as_str()).cloned().unwrap_or_else(|| id.to_string()))
                .collect();
            json!({
                "id": room.id,
                "name": room.name,
                "region": room.region,
                "owner": room.owner,
                "owner_name": names.get(room.owner.as_str()).cloned().unwrap_or_else(|| room.owner.to_string()),
                "capacity": room.capacity,
                "players": room.players,
                "members": members,
                "metadata": room.metadata,
                "joined": room.contains(account_id),
                "created_at_ms": room.created_at_ms,
            })
        })
        .collect();
    let current_room = game.room_id_of(account_id)?;

    let friend_ids = game.friends(account_id)?;
    let friends: Vec<Value> = friend_ids
        .iter()
        .map(|id| {
            json!({
                "id": id,
                "name": names.get(id.as_str()).cloned().unwrap_or_else(|| id.to_string()),
            })
        })
        .collect();
    let incoming: Vec<Value> = game
        .friend_requests(account_id)?
        .into_iter()
        .map(|request| {
            json!({
                "from": request.from,
                "from_name": names.get(request.from.as_str()).cloned().unwrap_or_else(|| request.from.to_string()),
                "message": request.message,
                "created_at_ms": request.created_at_ms,
            })
        })
        .collect();
    let outgoing: Vec<Value> = game
        .outgoing_friend_requests(account_id)?
        .into_iter()
        .map(|request| {
            json!({
                "to": request.to,
                "to_name": names.get(request.to.as_str()).cloned().unwrap_or_else(|| request.to.to_string()),
                "message": request.message,
                "created_at_ms": request.created_at_ms,
            })
        })
        .collect();
    let blocked: Vec<Value> = game
        .blocked_accounts(account_id)?
        .iter()
        .map(|id| {
            json!({
                "id": id,
                "name": names.get(id.as_str()).cloned().unwrap_or_else(|| id.to_string()),
            })
        })
        .collect();

    let trades: Vec<Value> = game
        .trades_for(account_id)?
        .iter()
        .map(|trade| {
            let other = trade.other(account_id);
            json!({
                "trade": trade,
                "other_name": other
                    .and_then(|id| names.get(id.as_str()).cloned())
                    .unwrap_or_else(|| "未知巡护员".into()),
            })
        })
        .collect();

    let npcs: Vec<Value> = game
        .npcs()
        .into_iter()
        .filter(|npc| {
            npc.region
                .as_ref()
                .map(|region| region == &account.region)
                .unwrap_or(true)
        })
        .map(|npc| {
            json!({
                "id": npc.id,
                "name": npc.name,
                "persona": npc.persona,
                "greeting": npc.greeting,
                "channel": npc.channel().to_string(),
                "room": npc.room,
                "region": npc.region,
            })
        })
        .collect();

    let regions: Vec<Value> = game
        .regions()
        .iter()
        .map(|region| {
            json!({
                "id": region.id,
                "name": region.name,
                "status": region.status,
                "capacity": region.capacity,
                "player_count": region.player_count(),
                "endpoint": region.endpoint,
            })
        })
        .collect();

    let channels = game.channels_for(account_id).unwrap_or_default();
    let items = game.items();
    let resources = game.resources();
    let skins = game.skins();
    let bob: AccountId = BOB.into();
    let bob_trade_done = game
        .trades_for(account_id)
        .unwrap_or_default()
        .iter()
        .any(|trade| trade.state == TradeState::Completed && trade.other(account_id) == Some(&bob));

    Ok(json!({
        "now_ms": game.now_ms(),
        "state_version": game.state_version(),
        "account": account,
        "wallet": wallet,
        "inventory": inventory,
        "tasks": tasks,
        "achievements": achievements,
        "collection": {
            "definition": collection_def,
            "progress": collection_progress,
        },
        "skins": {
            "catalog": skins,
            "owned": owned_skins,
        },
        "shops": shops,
        "leaderboards": leaderboards,
        "announcements": announcements,
        "unread_announcements": unread,
        "rooms": rooms,
        "current_room": current_room,
        "channels": channels,
        "social": {
            "people": people,
            "friends": friends,
            "incoming": incoming,
            "outgoing": outgoing,
            "blocked": blocked,
        },
        "trades": trades,
        "npcs": npcs,
        "regions": regions,
        "items": items,
        "resources": resources,
        "species": seed::SPECIES.iter().map(|meta| json!({
            "id": meta.id,
            "name": meta.name,
            "region": meta.region,
            "photo_item": meta.photo_item,
            "score": meta.score,
            "coins": meta.coins,
            "rarity": meta.rarity,
        })).collect::<Vec<_>>(),
        "demo": {
            "bob_id": BOB,
            "bob_name": names.get(BOB).cloned().unwrap_or_else(|| "阿宝".into()),
            "is_friend": game.are_friends(account_id, &bob),
            "bob_online": game.with_state(|state| state.accounts.get(&bob).map(|a| a.online).unwrap_or(false)),
            "bob_dm_channel": ChatChannel::private(account_id.clone(), bob.clone()).to_string(),
            "region_channel": ChatChannel::Region(account.region.clone()).to_string(),
            "guide_id": guide_for(account.region.as_str()),
            "trade_completed": bob_trade_done,
            "trade_cost": { "coins": 30, "items": { "photo_lion": 1 } },
            "trade_reward": "vintage_map",
        },
    }))
}

fn starter_pack(game: &Game, account: &AccountId, name: &str) {
    // One atomic reward bundle instead of several separate mutations.
    let _ = game.grant_reward(
        account,
        &Reward::new()
            .currency("coins", 120)
            .item("film", 4)
            .item("snack", 2)
            .resource("battery", 75)
            .xp(0),
    );
    let _ = game.accept_task(account, &"welcome_photo".into());
    let _ = game.send_system_message(
        ChatChannel::Global,
        &format!("🦒 巡护员「{name}」抵达园区，营地电台开始转播。"),
    );
}

// ===========================================================================
// Requests
// ===========================================================================

#[derive(Deserialize)]
struct LoginReq {
    account_id: String,
    name: String,
    region: String,
}

#[derive(Deserialize)]
struct AccountReq {
    account_id: String,
}

#[derive(Deserialize)]
struct PhotoReq {
    account_id: String,
    species: String,
}

#[derive(Deserialize)]
struct FeedReq {
    account_id: String,
    species: Option<String>,
}

#[derive(Deserialize)]
struct TaskReq {
    account_id: String,
    task: String,
}

#[derive(Deserialize)]
struct AchievementReq {
    account_id: String,
    achievement: String,
}

#[derive(Deserialize)]
struct CollectionReq {
    account_id: String,
    index: usize,
}

#[derive(Deserialize)]
struct ShopReq {
    account_id: String,
    offer: String,
    quantity: Option<u64>,
}

#[derive(Deserialize)]
struct RoomJoinReq {
    account_id: String,
    room_id: String,
}

#[derive(Deserialize)]
struct ChatSendReq {
    account_id: String,
    channel: String,
    body: String,
}

#[derive(Deserialize)]
struct ChatQuery {
    account_id: String,
    channel: String,
    limit: Option<usize>,
}

#[derive(Deserialize)]
struct TargetReq {
    account_id: String,
    target: String,
}

#[derive(Deserialize)]
struct TradeReq {
    account_id: String,
    trade_id: Option<String>,
}

#[derive(Deserialize)]
struct NpcChatReq {
    account_id: String,
    message: String,
}

#[derive(Deserialize)]
struct AnnouncementReq {
    account_id: String,
    id: String,
}

#[derive(Deserialize)]
struct SkinReq {
    account_id: String,
    skin: String,
}

#[derive(Deserialize)]
struct CategoryReq {
    account_id: String,
    category: String,
}

#[derive(Deserialize)]
struct AvatarReq {
    account_id: String,
    title: Option<String>,
    image: Option<String>,
}

#[derive(Deserialize)]
struct RegionMoveReq {
    account_id: String,
    region: String,
}

#[derive(Deserialize)]
struct RegionStatusReq {
    account_id: String,
    region: String,
    status: String,
}

// ===========================================================================
// Handlers
// ===========================================================================

async fn login(State(app): State<AppState>, Json(req): Json<LoginReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let name = req.name.trim();
    if name.is_empty() || name.chars().count() > 32 {
        return Err(ApiError::bad("BAD_NAME", "昵称需要 1–32 个字符"));
    }
    if req.region != SAVANNA && req.region != WETLAND {
        return Err(ApiError::bad("BAD_REGION", "未知园区"));
    }
    let region: RegionId = req.region.clone().into();
    let existed = app.game.account(&id).is_ok();

    let mut account = app.game.ensure_account(id.clone(), name, region.clone())?;
    if account.region != region {
        account = app.game.set_account_region(&id, region.clone())?;
    }
    if account.display_name != name {
        account = app.game.update_display_name(&id, name)?;
    }
    app.game.login(&id)?;

    if !existed {
        starter_pack(&app.game, &id, name);
    }

    finish(
        &app,
        &id,
        json!({ "first_login": !existed, "region": account.region }),
    )
}

async fn state(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    app.game.heartbeat(&id)?;
    Ok(Json(json!({ "ok": true, "state": state_json(&app, &id)? })))
}

async fn heartbeat(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    app.game.heartbeat(&id)?;
    Ok(Json(json!({ "ok": true })))
}

async fn logout(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    app.game.logout(&id)?;
    finish(&app, &id, json!({ "logged_out": true }))
}

async fn photo(State(app): State<AppState>, Json(req): Json<PhotoReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let game = &app.game;
    let account = game.account(&id)?;
    let meta: &SpeciesMeta = seed::species(req.species.trim())
        .ok_or_else(|| ApiError::bad("UNKNOWN_SPECIES", "未知动物"))?;
    if meta.region != account.region.as_str() {
        return Err(ApiError::bad(
            "SPECIES_NOT_HERE",
            format!(
                "{}生活在{}，不在当前园区",
                meta.name,
                seed::region_name(meta.region)
            ),
        ));
    }

    let item: ItemId = meta.photo_item.into();
    if game.item_count(&id, &"film".into())? < 1 {
        return Err(ApiError::bad("NO_FILM", "胶片用完了，去营地补给站买一包吧"));
    }
    if game.resource_balance(&id, &"battery".into())? < 5 {
        return Err(ApiError::bad(
            "NO_BATTERY",
            "相机没电了，等电量慢慢恢复，或者买备用电池",
        ));
    }

    let is_new_species = game.item_count(&id, &item)? == 0;
    game.add_item(&id, &item, 1)?;
    if let Err(error) = game.remove_item(&id, &"film".into(), 1) {
        let _ = game.remove_item(&id, &item, 1);
        return Err(error.into());
    }
    if let Err(error) = game.spend_resource(&id, &"battery".into(), 5) {
        let _ = game.add_item(&id, &"film".into(), 1);
        let _ = game.remove_item(&id, &item, 1);
        return Err(error.into());
    }

    let first = game.record_event(&id, "photos", 1)?;
    let mut completed_achievements = first.achievements.clone();
    let mut completed_tasks = first.tasks.clone();
    if is_new_species {
        let second = game.record_event(&id, "species_photos", 1)?;
        completed_achievements.extend(second.achievements);
        completed_tasks.extend(second.tasks);
    }
    game.add_leaderboard_score(&seed::PHOTO_BOARD.into(), &id, meta.score)?;
    game.add_currency(&id, &"coins".into(), meta.coins)?;
    let xp = game.add_xp(&id, 10)?;
    let level = ((xp / 100) + 1).min(99) as u32;
    if level > account.level {
        game.set_level(&id, level)?;
    }

    finish(
        &app,
        &id,
        json!({
            "species": meta.id,
            "species_name": meta.name,
            "item": meta.photo_item,
            "new_species": is_new_species,
            "coins": meta.coins,
            "score": meta.score,
            "achievements": completed_achievements,
            "tasks": completed_tasks,
        }),
    )
}

async fn feed(State(app): State<AppState>, Json(req): Json<FeedReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let game = &app.game;
    let account = game.account(&id)?;
    let species = match req.species.as_deref().and_then(seed::species) {
        Some(meta) if meta.region == account.region.as_str() => Some(meta),
        _ => None,
    };
    if game.item_count(&id, &"snack".into())? < 1 {
        return Err(ApiError::bad(
            "NO_SNACK",
            "没有动物零食了，去营地补给站买一份吧",
        ));
    }
    game.remove_item(&id, &"snack".into(), 1)?;
    game.add_currency(&id, &"coins".into(), 6)?;
    let xp = game.add_xp(&id, 8)?;
    let level = ((xp / 100) + 1).min(99) as u32;
    if level > account.level {
        game.set_level(&id, level)?;
    }
    let outcome = game.record_event(&id, "feeds", 1)?;
    game.add_leaderboard_score(&seed::RANGER_BOARD.into(), &id, 1)?;

    finish(
        &app,
        &id,
        json!({
            "fed": species.map(|meta| meta.name).unwrap_or("动物"),
            "species": species.map(|meta| meta.id),
            "achievements": outcome.achievements,
            "tasks": outcome.tasks,
        }),
    )
}

async fn task_accept(State(app): State<AppState>, Json(req): Json<TaskReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let view = app.game.accept_task(&id, &req.task.into())?;
    finish(&app, &id, json!({ "task": view }))
}

async fn task_claim(State(app): State<AppState>, Json(req): Json<TaskReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let reward = app.game.claim_task(&id, &req.task.into())?;
    finish(&app, &id, json!({ "reward": reward }))
}

async fn task_abandon(State(app): State<AppState>, Json(req): Json<TaskReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let task = req.task;
    app.game.abandon_task(&id, &task.as_str().into())?;
    finish(&app, &id, json!({ "abandoned": task }))
}

async fn achievement_claim(
    State(app): State<AppState>,
    Json(req): Json<AchievementReq>,
) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let reward = app.game.claim_achievement(&id, &req.achievement.into())?;
    finish(&app, &id, json!({ "reward": reward }))
}

async fn collection_claim(
    State(app): State<AppState>,
    Json(req): Json<CollectionReq>,
) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let reward = app
        .game
        .claim_collection_milestone(&id, &seed::ALBUM.into(), req.index)?;
    finish(&app, &id, json!({ "reward": reward }))
}

async fn shop_buy(State(app): State<AppState>, Json(req): Json<ShopReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let quantity = req.quantity.unwrap_or(1).clamp(1, 10);
    let receipt = app
        .game
        .purchase(&id, &seed::SHOP.into(), &req.offer.into(), quantity)?;
    finish(&app, &id, json!({ "receipt": receipt }))
}

async fn room_join(State(app): State<AppState>, Json(req): Json<RoomJoinReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let room = app.game.join_room(&id, &req.room_id.into())?;
    finish(&app, &id, json!({ "room": room }))
}

async fn room_leave(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let left = app.game.leave_room(&id)?;
    finish(&app, &id, json!({ "left": left }))
}

#[derive(Deserialize)]
struct RoomCreatePayload {
    account_id: String,
    name: String,
}

async fn room_create(
    State(app): State<AppState>,
    Json(req): Json<RoomCreatePayload>,
) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let account = app.game.account(&id)?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad("BAD_NAME", "房间需要一个名字"));
    }
    let room = app.game.create_room(
        &id,
        name,
        &account.region,
        8,
        BTreeMap::from([("topic".into(), "巡护员的临时电台".into())]),
    )?;
    finish(&app, &id, json!({ "room": room }))
}

fn bob_reply(message: &str) -> &'static str {
    let lower = message.to_lowercase();
    if lower.contains("地图") || lower.contains("交易") || lower.contains("换") {
        "成交的标准很简单：一张狮子照片、三十枚金币。准备好就来点「交换」。"
    } else if lower.contains("你好") || lower.contains("hi") || lower.contains("hello") {
        "这里是吉普车电台，阿宝在线。今天草原的风不错，东边水塘有犀牛。"
    } else if lower.contains("照片") || lower.contains("摄影") {
        "照片别只塞进图鉴，重复的动物照片可以拿来换东西。我还缺一张狮子。"
    } else if lower.contains("任务") {
        "公告板上每天都挂着新的巡护任务。别嫌琐碎，胶片很贵的。"
    } else {
        "收到，收到。电台信号有点杂，你说的话我都记在日志里了。"
    }
}

async fn chat_send(State(app): State<AppState>, Json(req): Json<ChatSendReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let channel = parse_channel(req.channel.trim())?;
    let body = req.body.trim();
    if body.is_empty() {
        return Err(ApiError::bad("EMPTY_CONTENT", "消息不能为空"));
    }
    let message = app.game.send_message_with_metadata(
        &id,
        channel.clone(),
        body,
        BTreeMap::from([("client".into(), "taixu-safari-web".into())]),
    )?;
    let bob: AccountId = BOB.into();

    let mut replied = false;
    if let ChatChannel::Private { a, b } = &channel {
        let with_bob = (a == &bob && b == &id) || (b == &bob && a == &id);
        if with_bob && app.game.are_friends(&id, &bob) {
            let reply = bob_reply(body);
            if app.game.send_message(&bob, channel.clone(), reply).is_ok() {
                replied = true;
            }
        }
    }

    let messages = app.game.recent_messages(&id, channel.clone(), 80)?;
    finish(
        &app,
        &id,
        json!({
            "channel": channel,
            "message": message,
            "messages": messages,
            "bob_replied": replied,
        }),
    )
}

async fn chat_messages(State(app): State<AppState>, Query(query): Query<ChatQuery>) -> JsonResult {
    let id = account_id(&query.account_id)?;
    let channel = parse_channel(query.channel.trim())?;
    let messages = app.game.recent_messages(
        &id,
        channel.clone(),
        query.limit.unwrap_or(50).clamp(1, 100),
    )?;
    Ok(Json(json!({
        "ok": true,
        "channel": channel,
        "messages": messages,
    })))
}

async fn friend_add(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let bob: AccountId = BOB.into();
    let mut became_friends = false;
    if !app.game.are_friends(&id, &bob) {
        app.game
            .send_friend_request(&id, &bob, Some("电台里听到你的呼号了。"))?;
        app.game.accept_friend_request(&bob, &id)?;
        became_friends = true;
        let dm = ChatChannel::private(id.clone(), bob.clone());
        let _ = app.game.send_message(
            &bob,
            dm,
            "呼号确认！我是阿宝。以后可以在私聊里找我换东西，或者问问草原上的动物。",
        );
    }
    finish(
        &app,
        &id,
        json!({ "became_friends": became_friends, "bob_id": BOB }),
    )
}

async fn friend_remove(State(app): State<AppState>, Json(req): Json<AccountReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let bob: AccountId = BOB.into();
    let removed = app.game.remove_friend(&id, &bob)?;
    finish(&app, &id, json!({ "removed": removed }))
}

async fn friend_block(State(app): State<AppState>, Json(req): Json<TargetReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let target: AccountId = req.target.into();
    app.game.block_account(&id, &target)?;
    finish(&app, &id, json!({ "blocked": target }))
}

async fn friend_unblock(State(app): State<AppState>, Json(req): Json<TargetReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let target: AccountId = req.target.into();
    app.game.unblock_account(&id, &target)?;
    finish(&app, &id, json!({ "unblocked": target }))
}

async fn trade_start(State(app): State<AppState>, Json(req): Json<TradeReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let game = &app.game;
    let bob: AccountId = BOB.into();

    if let Some(trade) = game
        .trades_for(&id)?
        .into_iter()
        .find(|trade| trade.state == TradeState::Open && trade.other(&id) == Some(&bob))
    {
        return finish(&app, &id, json!({ "trade": trade, "already_open": true }));
    }
    let completed = game
        .trades_for(&id)?
        .iter()
        .any(|trade| trade.state == TradeState::Completed && trade.other(&id) == Some(&bob));
    if completed {
        return Err(ApiError::bad(
            "TRADE_DONE",
            "阿宝的珍藏地图已经给你了，他没有第二份了",
        ));
    }
    if game.item_count(&bob, &"vintage_map".into())? < 1 {
        return Err(ApiError::bad(
            "TRADE_UNAVAILABLE",
            "阿宝暂时没有可交换的物品",
        ));
    }

    let trade = game.create_trade(&id, &bob)?;
    let trade = game.set_trade_side(
        &bob,
        &trade.id,
        TradeSide::new().with_items(BTreeMap::from([("vintage_map".into(), 1)])),
    )?;
    finish(&app, &id, json!({ "trade": trade, "already_open": false }))
}

async fn trade_confirm(State(app): State<AppState>, Json(req): Json<TradeReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let trade_id: TradeId = req
        .trade_id
        .ok_or_else(|| ApiError::bad("BAD_TRADE", "缺少交易 ID"))?
        .into();
    let game = &app.game;
    let bob: AccountId = BOB.into();

    let player_side = TradeSide::new()
        .with_items(BTreeMap::from([("photo_lion".into(), 1)]))
        .with_currencies(BTreeMap::from([("coins".into(), 30)]));
    game.set_trade_side(&id, &trade_id, player_side)?;
    game.confirm_trade(&id, &trade_id)?;
    let settled = game.confirm_trade(&bob, &trade_id)?;

    finish(
        &app,
        &id,
        json!({
            "trade": settled,
            "received": { "item": "vintage_map", "quantity": 1 },
        }),
    )
}

async fn trade_cancel(State(app): State<AppState>, Json(req): Json<TradeReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let trade_id: TradeId = req
        .trade_id
        .ok_or_else(|| ApiError::bad("BAD_TRADE", "缺少交易 ID"))?
        .into();
    let trade = app.game.cancel_trade(&id, &trade_id)?;
    finish(&app, &id, json!({ "trade": trade }))
}

async fn npc_chat(State(app): State<AppState>, Json(req): Json<NpcChatReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let account = app.game.account(&id)?;
    let guide = guide_for(account.region.as_str());
    let message = req.message.trim();
    if message.is_empty() {
        return Err(ApiError::bad("EMPTY_CONTENT", "说点什么吧"));
    }
    let guide_id: NpcId = guide.into();
    let turn = app
        .npcs
        .converse(&app.game, &guide_id, &id, message)
        .await?;
    let channel = ChatChannel::Region(account.region.clone());
    let messages = app.game.recent_messages(&id, channel.clone(), 80)?;
    finish(
        &app,
        &id,
        json!({ "turn": turn, "messages": messages, "channel": channel }),
    )
}

async fn announcement_read(
    State(app): State<AppState>,
    Json(req): Json<AnnouncementReq>,
) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let announcement = req.id;
    app.game
        .mark_announcement_read(&id, &announcement.as_str().into())?;
    finish(&app, &id, json!({ "read": announcement }))
}

async fn skin_equip(State(app): State<AppState>, Json(req): Json<SkinReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let previous = app.game.equip_skin(&id, &req.skin.into())?;
    finish(&app, &id, json!({ "previous": previous }))
}

async fn skin_unequip(State(app): State<AppState>, Json(req): Json<CategoryReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let category = parse_category(req.category.trim())?;
    let removed = app.game.unequip_skin(&id, &category)?;
    finish(&app, &id, json!({ "removed": removed }))
}

async fn avatar_update(State(app): State<AppState>, Json(req): Json<AvatarReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let current = app.game.account(&id)?;
    let avatar = Avatar {
        image: req.image,
        frame: current.avatar.frame,
        badge: current.avatar.badge,
        title: req.title,
    };
    let avatar = app.game.update_avatar(&id, avatar)?;
    finish(&app, &id, json!({ "avatar": avatar }))
}

async fn region_move(State(app): State<AppState>, Json(req): Json<RegionMoveReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    if req.region != SAVANNA && req.region != WETLAND {
        return Err(ApiError::bad("BAD_REGION", "未知园区"));
    }
    let account = app.game.set_account_region(&id, req.region)?;
    finish(&app, &id, json!({ "region": account.region }))
}

async fn region_status(
    State(app): State<AppState>,
    Json(req): Json<RegionStatusReq>,
) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let region: RegionId = req.region.into();
    let status = match req.status.as_str() {
        "open" => RegionStatus::Open,
        "maintenance" => RegionStatus::Maintenance,
        "closed" => RegionStatus::Closed,
        _ => {
            return Err(ApiError::bad(
                "BAD_STATUS",
                "状态必须是 open / maintenance / closed",
            ))
        }
    };
    let region = app.game.set_region_status(&region, status)?;
    finish(&app, &id, json!({ "region": region }))
}

#[derive(Deserialize)]
struct SeasonReq {
    account_id: String,
    board: String,
}

async fn season_reset(State(app): State<AppState>, Json(req): Json<SeasonReq>) -> JsonResult {
    let id = account_id(&req.account_id)?;
    let board = req.board;
    let season = app.game.reset_leaderboard_season(&board.as_str().into())?;
    finish(&app, &id, json!({ "board": board, "season": season }))
}

// ===========================================================================
// Router
// ===========================================================================

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/login", post(login))
        .route("/api/state", post(state))
        .route("/api/heartbeat", post(heartbeat))
        .route("/api/logout", post(logout))
        .route("/api/photo", post(photo))
        .route("/api/feed", post(feed))
        .route("/api/task/accept", post(task_accept))
        .route("/api/task/claim", post(task_claim))
        .route("/api/task/abandon", post(task_abandon))
        .route("/api/achievement/claim", post(achievement_claim))
        .route("/api/collection/claim", post(collection_claim))
        .route("/api/shop/buy", post(shop_buy))
        .route("/api/room/join", post(room_join))
        .route("/api/room/leave", post(room_leave))
        .route("/api/room/create", post(room_create))
        .route("/api/chat/send", post(chat_send))
        .route("/api/chat/messages", get(chat_messages))
        .route("/api/friend/add", post(friend_add))
        .route("/api/friend/remove", post(friend_remove))
        .route("/api/friend/block", post(friend_block))
        .route("/api/friend/unblock", post(friend_unblock))
        .route("/api/trade/start", post(trade_start))
        .route("/api/trade/confirm", post(trade_confirm))
        .route("/api/trade/cancel", post(trade_cancel))
        .route("/api/npc/chat", post(npc_chat))
        .route("/api/announcement/read", post(announcement_read))
        .route("/api/skin/equip", post(skin_equip))
        .route("/api/skin/unequip", post(skin_unequip))
        .route("/api/avatar", post(avatar_update))
        .route("/api/region/move", post(region_move))
        .route("/api/admin/region-status", post(region_status))
        .route("/api/admin/season-reset", post(season_reset))
}

/// Register the live (non-serializable) NPC agents on boot.
pub fn build_npc_runtime() -> NpcRuntime {
    let mut runtime = NpcRuntime::new();
    runtime.register(
        GUIDE_SAVANNA,
        std::sync::Arc::new(GuideAgent::new(GuideKind::Savanna)),
    );
    runtime.register(
        GUIDE_WETLAND,
        std::sync::Arc::new(GuideAgent::new(GuideKind::Wetland)),
    );
    runtime
}
