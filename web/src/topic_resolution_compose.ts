/**
 * This module handles the compose box flow for resolving topics when
 * the organization setting `topic_resolution_message_requirement` is
 * set to "required" or "optional".
 *
 * When resolving a topic in these modes, instead of resolving immediately,
 * the compose box is opened and the user can optionally enter a message
 * explaining why the topic was resolved.
 */

import * as channel from "./channel.ts";
import * as compose_actions from "./compose_actions.ts";
import * as compose_banner from "./compose_banner.ts";
import * as compose_state from "./compose_state.ts";
import * as compose_validate from "./compose_validate.ts";
import {$t} from "./i18n.ts";
import * as resolved_topic from "./resolved_topic.ts";
import * as topic_resolution_state from "./topic_resolution_state.ts";

// Re-export state functions for consumers
export const MIN_RESOLUTION_MESSAGE_LENGTH = topic_resolution_state.MIN_RESOLUTION_MESSAGE_LENGTH;
export const has_pending_resolution = topic_resolution_state.has_pending_resolution;
export const get_pending_resolution = topic_resolution_state.get_pending_resolution;
export const is_message_requirement_enabled = topic_resolution_state.is_message_requirement_enabled;
export const is_message_required = topic_resolution_state.is_message_required;
export const is_message_optional = topic_resolution_state.is_message_optional;
export const is_resolve_via_move_allowed = topic_resolution_state.is_resolve_via_move_allowed;

export function clear_pending_resolution(): void {
    topic_resolution_state.clear_pending_resolution_state();
    // Remove the resolution banner if present
    compose_banner.clear_topic_resolution_banners();
}

/**
 * Opens the compose box for entering a topic resolution message.
 * This is called when the user clicks the resolve topic button and
 * the organization setting requires or allows a resolution message.
 */
export function start_resolution_compose(
    message_id: number,
    stream_id: number,
    topic: string,
    report_errors_in_global_banner: boolean,
): void {
    // Store the pending resolution state
    topic_resolution_state.set_pending_resolution({
        message_id,
        stream_id,
        topic,
        report_errors_in_global_banner,
    });

    // Open the compose box targeting the same stream and topic
    compose_actions.start({
        message_type: "stream",
        stream_id,
        topic,
        trigger: "topic_resolution",
        keep_composebox_empty: true,
    });

    // Show the resolution banner
    show_resolution_banner();

    // Update send button status - in Required mode, button should start disabled
    compose_validate.validate_and_update_send_button_status();
}

function show_resolution_banner(): void {
    const is_required = is_message_required();
    compose_banner.show_topic_resolution_banner(is_required, () => {
        resolve_without_message();
    });
}

/**
 * Check if the current message content meets the minimum length requirement.
 */
export function meets_minimum_length(): boolean {
    const content = compose_state.message_content().trim();
    return content.length >= MIN_RESOLUTION_MESSAGE_LENGTH;
}

/**
 * Resolve the topic via API (optionally with a resolution message).
 */
function do_resolve_topic_api(
    message_id: number,
    topic: string,
    resolution_message?: string,
): void {
    const new_topic_name = resolved_topic.resolve_name(topic);
    const request: Record<string, string | boolean> = {
        propagate_mode: "change_all",
        topic: new_topic_name,
        send_notification_to_old_thread: false,
        send_notification_to_new_thread: true,
    };

    // If a resolution message is provided, include it in the request
    // so it gets quoted in the Notification Bot's message
    if (resolution_message) {
        request["resolution_message"] = resolution_message;
    }

    void channel.patch({
        url: "/json/messages/" + message_id,
        data: request,
    });
}

/**
 * Resolve the topic without a message (only allowed in "optional" mode).
 */
export function resolve_without_message(): void {
    if (!is_message_optional() || !has_pending_resolution()) {
        return;
    }

    const pending = topic_resolution_state.get_pending_resolution()!;
    const {message_id, topic} = pending;

    // Clear the pending state and close compose
    clear_pending_resolution();
    compose_actions.cancel();

    // Do the actual resolution
    do_resolve_topic_api(message_id, topic);
}

/**
 * Complete the resolution with the user's message.
 * This is called when the user sends the compose message in resolution mode.
 *
 * The resolution message content is passed to the API and quoted by the
 * Notification Bot. No separate user message is sent.
 */
export function complete_resolution_with_message(): void {
    if (!has_pending_resolution()) {
        return;
    }

    const pending = topic_resolution_state.get_pending_resolution()!;
    const {message_id, topic} = pending;

    // Get the message content to pass as resolution_message
    const resolution_message = compose_state.message_content().trim();

    // Clear the pending state
    topic_resolution_state.clear_pending_resolution_state();

    // Clear banners and close compose box
    compose_banner.clear_topic_resolution_banners();
    compose_actions.cancel();

    // Resolve the topic with the resolution message - the notification will quote it
    do_resolve_topic_api(message_id, topic, resolution_message || undefined);
}

export function get_resolution_blocked_error(): string {
    return $t({
        defaultMessage:
            "Your organization requires a message when resolving topics. Please use the resolve topic button instead.",
    });
}
