// Ajoute une classe sur le <body> selon le rôle
Hooks.once("ready", () => {
  if (game.user.isGM) {
    document.body.classList.add("is-gm");
  } else {
    document.body.classList.remove("is-gm");
  }
});

// Ajoute le bouton dans l'onglet Acteurs
Hooks.on("renderActorDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  const $html = html instanceof jQuery ? html : $(html);
  if ($html.find(".give-xp-button").length > 0) return;

	const button = $(`
	<button class="give-xp-button">
		<i class="fas fa-star"></i> ${game.i18n.localize("monKit.dialog.confirm")}
	</button>`
	);

  button.on("click", () => {
    launchXPDialog();
  });

  const footer = $html.find(".directory-footer");
  if (footer.length) {
    footer.append(button);
  }
});

// Fonction principale
function launchXPDialog() {
  const actors = game.actors.filter(a =>
    a.type === "character" && a.hasPlayerOwner
  );

  if (actors.length === 0) {
    ui.notifications.warn(game.i18n.localize("monKit.notification.noActors"));
    return;
  }

  const formHtml = `
    <form class="monkit-xp-form">
      <div class="form-group">
        <label for="xp-amount">${game.i18n.localize("monKit.dialog.xpLabel")}</label>
        <input type="number" id="xp-amount" name="xp" value="80" min="0" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("monKit.dialog.targetLabel")}</label>
        <div class="actor-list">
          ${actors.map(actor => `
            <label class="actor-entry">
              <input type="checkbox" name="actor" value="${actor.id}" checked />
              ${actor.name}
            </label>
          `).join("")}
        </div>
        <button type="button" class="deselect-all">
          <i class="fas fa-times"></i> ${game.i18n.localize("monKit.dialog.deselect")}
        </button>
      </div>
    </form>
  `;

  const dialog = new Dialog({
    title: game.i18n.localize("monKit.dialog.title"),
    content: formHtml,
    buttons: {
      valider: {
        label: "✅ " + game.i18n.localize("monKit.dialog.confirm"),
        callback: html => {
          const xp = parseInt(html.find('[name="xp"]').val());
          const selectedIds = html.find('[name="actor"]:checked').map(function () {
            return this.value;
          }).get();

          selectedIds.forEach(id => {
            const actor = game.actors.get(id);
            const current = actor.system.details.xp.value ?? 0;
            actor.setFlag("monKit_XP", "lastXP", xp);
            actor.setFlag("monKit_XP", "undoAllowed", true);
            actor.update({ "system.details.xp.value": current + xp });

            // Sélection d'un message localisé aléatoire
            const idx = Math.floor(Math.random() * 3);
            let message = game.i18n.format(`monKit.chat.gains.${idx}`, {
              name: actor.name,
              xp
            });

            const content = `
              <div class="xp-message monkit-xp-message">
                <span class="xp-line" data-actor-id="${actor.id}" data-xp="${xp}">${message}</span>
                <button class="undo-xp square" data-actor-id="${actor.id}" title="Remettre" style="margin-left: 8px">
                  <i class="fas fa-undo"></i>
                </button>
              </div>
            `;

            ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              flags: {
                monKit_XP: {
                  undoable: true,
                  actorId: actor.id,
                  xp
                }
              },
              content
            });
          });
        }
      },
      cancel: {
        label: game.i18n.localize("monKit.dialog.cancel")
      }
    },
    default: "valider",
    render: html => {
      html.find(".deselect-all").on("click", () => {
        html.find('[name="actor"]').prop("checked", false);
      });
    }
  });

  dialog.render(true);
}

// Gère le bouton Remettre dans le chat
Hooks.on("renderChatMessage", (message, html, data) => {
  if (!game.user.isGM) {
    html.find(".undo-xp").remove();
  }

  if (message.flags?.monKit_XP?.undoable && game.user.isGM) {
    html.find(".undo-xp").on("click", async ev => {
      const button = ev.currentTarget;
      const actorId = message.flags.monKit_XP.actorId;
      const actor = game.actors.get(actorId);

      const canUndo = await actor.getFlag("monKit_XP", "undoAllowed");
      if (!canUndo) return;

      const xp = message.flags.monKit_XP.xp;
      const current = actor.system.details.xp.value ?? 0;

      await actor.update({ "system.details.xp.value": Math.max(current - xp, 0) });
      await actor.setFlag("monKit_XP", "undoAllowed", false);

      const span = html.find(`.xp-line[data-actor-id='${actorId}']`);
      span.css("text-decoration", "line-through");
      span.addClass("cancelled");
      button.remove();

      message.update({
        "flags.monKit_XP.undoable": false
      });
    });
  }

  // Si le message a déjà été annulé, on barre
  if (message.flags?.monKit_XP && !message.flags.monKit_XP.undoable) {
    const span = html.find(".xp-line");
    span.css("text-decoration", "line-through");
    span.addClass("cancelled");
    html.find(".undo-xp").remove();
  }
});
