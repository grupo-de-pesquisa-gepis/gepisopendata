;;; init.el --- Emacs config for gepisopendata (Rust + Tauri v2)  -*- lexical-binding: t; -*-
;;
;; Usage:
;;   emacs -q -l /path/to/gepisopendata/init.el
;;
;; Or define a shell alias in your shell rc:
;;   alias emacs-gepis='emacs -q -l /run/media/wgn/ext4/Projects-Srcs/Projects-Srcs-GEPIS/gepisopendata/init.el'


;;; ---------------------------------------------------------------
;; 0a. Native compiler — silence false-positive warnings
;;     When packages are compiled to native code for the first time,
;;     the async compiler processes each file in isolation and cannot
;;     resolve cross-file forward references.  These warnings do not
;;     affect runtime behavior.  Setting this variable to 'silent
;;     keeps native compilation active while suppressing the noise.
;;; ---------------------------------------------------------------

(setq native-comp-async-report-warnings-errors 'silent)


;;; ---------------------------------------------------------------
;; 0b. Package bootstrap (straight.el + use-package)
;;     All packages land in a local .emacs-cache-gepisopendata/ cache beside
;;     this file, keeping the system Emacs config untouched.
;;; ---------------------------------------------------------------

(defconst gepis/config-dir
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory that contains this init.el.")

(defconst gepis/project-root
  (cond
   ((file-exists-p (expand-file-name "Cargo.toml" gepis/config-dir))
    gepis/config-dir)
   ((file-exists-p (expand-file-name "../../Cargo.toml" gepis/config-dir))
    (expand-file-name "../../" gepis/config-dir))
   (t gepis/config-dir))
  "Root directory of the gepisopendata repository.")

(defconst gepis/cache-dir
  (expand-file-name ".emacs-cache-gepisopendata/" gepis/config-dir)
  "Local package cache — keeps the system ~/.emacs.d clean.")

;; Redirect all Emacs ephemeral files into the local cache
(setq user-emacs-directory gepis/cache-dir)
(setq package-user-dir (expand-file-name "elpa/" gepis/cache-dir))

;; Bootstrap straight.el
(defvar bootstrap-version)
(let ((bootstrap-file
       (expand-file-name "straight/repos/straight.el/bootstrap.el"
                         gepis/cache-dir))
      (bootstrap-version 7))
  (unless (file-exists-p bootstrap-file)
    (with-current-buffer
        (url-retrieve-synchronously
         "https://raw.githubusercontent.com/radian-software/straight.el/develop/install.el"
         'silent 'inhibit-cookies)
      (goto-char (point-max))
      (eval-print-last-sexp)))
  (load bootstrap-file nil 'nomessage))

(straight-use-package 'use-package)
(setq straight-use-package-by-default t)
(setq use-package-always-ensure t)


;;; ---------------------------------------------------------------
;; 1. Rust & Cargo PATH setup
;;    Ensure ~/.cargo/bin and ~/.local/bin are on exec-path and PATH
;;    so rustc, cargo, rust-analyzer, rustfmt, and clippy are always
;;    found even when Emacs is launched from a desktop launcher.
;;; ---------------------------------------------------------------

(dolist (dir (list (expand-file-name "~/.cargo/bin")
                   (expand-file-name "~/.local/bin")))
  (when (file-directory-p dir)
    (add-to-list 'exec-path dir)
    (unless (string-match-p (regexp-quote dir) (or (getenv "PATH") ""))
      (setenv "PATH" (concat dir ":" (getenv "PATH"))))))


;;; ---------------------------------------------------------------
;; 2. Core UI / UX
;;; ---------------------------------------------------------------

(setq inhibit-startup-screen t
      initial-scratch-message nil
      ring-bell-function 'ignore)

(menu-bar-mode   1)    ; on, to host the "Rust / Gepis" build menu (section 6)
(tool-bar-mode   -1)
(scroll-bar-mode -1)
(column-number-mode 1)
(global-display-line-numbers-mode 1)
(show-paren-mode 1)
(electric-pair-mode 1) ; auto-close (), [], {}, "" in Rust and config files

;; Sensible defaults (100 columns matches standard rustfmt max_width)
(setq-default indent-tabs-mode nil
              tab-width 4
              fill-column 100)
(setq sentence-end-double-space nil
      require-final-newline t
      compilation-scroll-output 'first-error)

;; Keep backup and auto-save files out of the project tree
(setq backup-directory-alist
      `(("." . ,(expand-file-name "backups/" gepis/cache-dir)))
      auto-save-file-name-transforms
      `((".*" ,(expand-file-name "auto-save/" gepis/cache-dir) t)))

;; Unlike backup-directory-alist, Emacs does not auto-create the
;; auto-save directory, so it must be created explicitly here.
(make-directory (expand-file-name "auto-save/" gepis/cache-dir) t)


;;; ---------------------------------------------------------------
;; 3. Fonts — buffer and UI text only
;;    Tries a list of Nerd Fonts commonly unpacked into
;;    ~/.local/share/fonts, falling back to Cascadia Mono NF or
;;    DejaVu Sans Mono on Fedora.
;;; ---------------------------------------------------------------

(defun gepis/set-font ()
  "Set the default and fixed-pitch face to the first available font."
  (let ((font (seq-find (lambda (f) (member f (font-family-list)))
                        '("FiraCode Nerd Font Mono"
                          "JetBrainsMono Nerd Font Mono"
                          "Hack Nerd Font Mono"
                          "CaskaydiaCove Nerd Font Mono"
                          "Cascadia Mono NF"
                          "DejaVu Sans Mono"))))
    (when font
      (set-face-attribute 'default nil :family font :height 110)
      (set-face-attribute 'fixed-pitch nil :family font :height 110))))

(add-hook 'after-init-hook #'gepis/set-font)


;;; ---------------------------------------------------------------
;; 4. Theme
;;; ---------------------------------------------------------------

(use-package modus-themes
  :config
  (modus-themes-load-theme 'modus-operandi))   ; light theme, easy on the eyes
                                                ; swap for 'modus-vivendi for dark


;;; ---------------------------------------------------------------
;; 5. Completion framework (Vertico + Orderless + Marginalia)
;;; ---------------------------------------------------------------

(use-package vertico
  :init (vertico-mode 1))

(use-package orderless
  :custom
  (completion-styles '(orderless basic))
  (completion-category-overrides '((file (styles basic partial-completion))
                                   (eglot (styles orderless))
                                   (eglot-capf (styles orderless)))))

(use-package marginalia
  :init (marginalia-mode 1))


;;; ---------------------------------------------------------------
;; 5b. In-buffer completion popup (Corfu + Cape)
;;
;;     Corfu renders candidates from `completion-at-point-functions',
;;     which Eglot populates from `rust-analyzer'.  Trigger characters
;;     "." and ":" open the popup immediately for method/field access
;;     and Rust `::' path segments.
;;; ---------------------------------------------------------------

(use-package corfu
  :init
  (global-corfu-mode 1)
  :custom
  (corfu-cycle t)
  (corfu-quit-no-match t)
  (corfu-on-exact-match nil)
  (corfu-preselect 'first)
  (corfu-preview-current nil)
  :bind
  (:map corfu-map
        ("RET"    . nil)       ; Enter stays Enter, popup or no popup
        ([return] . nil)
        ("TAB"    . corfu-insert)
        ([tab]    . corfu-insert)
        ("C-n"    . corfu-next)
        ("C-p"    . corfu-previous)
        ("C-g"    . corfu-quit))
  :config
  (require 'corfu-auto)
  (setq corfu-auto t
        corfu-auto-delay 0.15
        corfu-auto-prefix 2
        ;; Open completion immediately after "." (methods/fields) and
        ;; ":" (module/type paths `std::...`, `Self::...`).
        corfu-auto-trigger ".:")

  ;; Side panel showing rustdoc documentation of the highlighted item.
  (require 'corfu-popupinfo)
  (corfu-popupinfo-mode 1)
  (setq corfu-popupinfo-delay '(0.4 . 0.2)))

(use-package cape
  :demand t
  :init
  (defun gepis/prog-capf-setup ()
    "Add fallback file-path and buffer-word completion after LSP (Eglot)."
    (add-hook 'completion-at-point-functions #'cape-file    90 t)
    (add-hook 'completion-at-point-functions #'cape-dabbrev 95 t))
  (add-hook 'prog-mode-hook #'gepis/prog-capf-setup)
  :custom
  (cape-dabbrev-buffer-function #'cape-same-mode-buffers)
  (cape-file-directory-must-exist t))


;;; ---------------------------------------------------------------
;; 6. Rust major mode + Cargo build/test/run integration
;;; ---------------------------------------------------------------

(use-package rust-mode
  :mode ("\\.rs\\'" . rust-mode)
  :custom
  (rust-indent-offset 4)
  ;; Only auto-format on save when rustfmt is installed on the host
  ;; (install on Fedora with: sudo dnf install rustfmt clippy)
  (rust-format-on-save (and (executable-find "rustfmt") t))
  :config
  (defun gepis/cargo-compile (subcommand)
    "Run `cargo SUBCOMMAND' from `gepis/project-root' in a compilation buffer."
    (let ((default-directory gepis/project-root))
      (compile (format "cargo %s" subcommand))))

  (defun gepis/cargo-check ()
    "Run `cargo check' at the repository root."
    (interactive)
    (gepis/cargo-compile "check"))

  (defun gepis/cargo-clippy ()
    "Run `cargo clippy' (or warn if clippy is not installed)."
    (interactive)
    (if (executable-find "cargo-clippy")
        (gepis/cargo-compile "clippy")
      (user-error "clippy is not installed — install it with: sudo dnf install clippy")))

  (defun gepis/cargo-build ()
    "Run `cargo build' at the repository root."
    (interactive)
    (gepis/cargo-compile "build"))

  (defun gepis/cargo-test ()
    "Run `cargo test' at the repository root."
    (interactive)
    (gepis/cargo-compile "test"))

  (defun gepis/cargo-run ()
    "Run `cargo run' at the repository root."
    (interactive)
    (gepis/cargo-compile "run"))

  (defun gepis/format-buffer ()
    "Format the current Rust buffer via Eglot/rustfmt."
    (interactive)
    (cond
     ((not (executable-find "rustfmt"))
      (user-error "rustfmt is not installed — install it with: sudo dnf install rustfmt"))
     ((bound-and-true-p eglot--managed-mode)
      (eglot-format-buffer))
     (t
      (rust-format-buffer))))

  ;; Keybindings inside rust-mode buffers
  (define-key rust-mode-map (kbd "C-c C-c") #'gepis/cargo-check)
  (define-key rust-mode-map (kbd "C-c C-k") #'gepis/cargo-clippy)
  (define-key rust-mode-map (kbd "C-c C-b") #'gepis/cargo-build)
  (define-key rust-mode-map (kbd "C-c C-t") #'gepis/cargo-test)
  (define-key rust-mode-map (kbd "C-c C-r") #'gepis/cargo-run)
  (define-key rust-mode-map (kbd "C-c C-f") #'gepis/format-buffer)

  ;; Top-bar "Gepis-Rust" menu for one-click Cargo & LSP actions
  (easy-menu-define gepis/rust-menu rust-mode-map "Gepis Rust & Tauri commands."
    '("Gepis-Rust"
      ["Cargo Check (C-c C-c)"          gepis/cargo-check  t]
      ["Cargo Clippy (C-c C-k)"         gepis/cargo-clippy t]
      ["Cargo Build (C-c C-b)"          gepis/cargo-build  t]
      ["Cargo Test (C-c C-t)"           gepis/cargo-test   t]
      ["Cargo Run (C-c C-r)"            gepis/cargo-run    t]
      "--"
      ["Format Buffer (C-c C-f)"        gepis/format-buffer t]
      ["Code Actions / Quick Fix"       eglot-code-actions  t]
      ["Rename Symbol"                  eglot-rename        t]
      ["Find Definition (M-.)"          xref-find-definitions t]
      ["Find References (M-?)"          xref-find-references  t]
      ["Restart rust-analyzer"          eglot-reconnect     t])))

(use-package cargo
  :hook (rust-mode . cargo-minor-mode))


;;; ---------------------------------------------------------------
;; 7. LSP Client — Eglot (built-in) + rust-analyzer
;;    Provides real-time diagnostics (Flymake), type/doc hover
;;    (Eldoc), go-to-definition (Xref), code actions, and completions
;;    (via Corfu).  Configured with procMacro and buildScripts enabled
;;    for Tauri v2 (`#[tauri::command]') and Serde derive macros.
;;; ---------------------------------------------------------------

(use-package eglot
  :straight nil
  :hook (rust-mode . eglot-ensure)
  :bind (:map eglot-mode-map
              ("C-c l a" . eglot-code-actions)
              ("C-c l r" . eglot-rename)
              ("C-c l f" . gepis/format-buffer)
              ("C-c l d" . eldoc-doc-buffer)
              ("M-n"     . flymake-goto-next-error)
              ("M-p"     . flymake-goto-prev-error))
  :custom
  (eglot-autoshutdown t)
  (eglot-extend-to-xref t)
  :config
  (let ((check-cmd (if (executable-find "cargo-clippy") "clippy" "check")))
    (setq-default
     eglot-workspace-configuration
     `(:rust-analyzer
       (:cargo (:buildScripts (:enable t)
                :features "all")
        :procMacro (:enable t)
        :checkOnSave t
        :check (:command ,check-cmd))))))


;;; ---------------------------------------------------------------
;; 8. TOML, JSON & Web files (Cargo.toml, tauri.conf.json, etc.)
;;; ---------------------------------------------------------------

(use-package conf-mode
  :straight nil
  :mode (("\\.toml\\'"       . conf-toml-mode)
         ("Cargo\\.lock\\'"  . conf-toml-mode)
         ("Tauri\\.toml.*\\'" . conf-toml-mode)))


;;; ---------------------------------------------------------------
;; 9. Flyspell — spell checking in comments/strings and docs
;;    Uses hunspell (pt_BR) when available.  In Rust buffers only
;;    comments and string literals are checked (`flyspell-prog-mode').
;;; ---------------------------------------------------------------

(use-package flyspell
  :straight nil
  :if (executable-find "hunspell")
  :hook ((org-mode      . flyspell-mode)
         (markdown-mode . flyspell-mode)
         (rust-mode     . flyspell-prog-mode))
  :custom
  (ispell-program-name "hunspell")
  (ispell-dictionary "pt_BR"))


;;; ---------------------------------------------------------------
;; 10. Org-mode tweaks (for README.org / FASE1_BACKEND_MODULARIZATION.org)
;;; ---------------------------------------------------------------

(use-package org
  :straight nil
  :mode ("\\.org\\'" . org-mode)
  :custom
  (org-startup-folded 'content)
  (org-hide-leading-stars t)
  (org-src-fontify-natively t)
  (org-src-tab-acts-natively t))


;;; ---------------------------------------------------------------
;; 11. Project navigation — project.el pointing at the repo root
;;; ---------------------------------------------------------------

(use-package project
  :straight nil
  :config
  (when (file-directory-p (expand-file-name ".git" gepis/project-root))
    (project-remember-project `(vc Git ,gepis/project-root))))


;;; ---------------------------------------------------------------
;; 12. Magit — Git porcelain
;;; ---------------------------------------------------------------

(use-package magit
  :bind
  ("C-x g" . magit-status))


;;; ---------------------------------------------------------------
;; 13. Treemacs — file/directory sidebar
;;; ---------------------------------------------------------------

(use-package treemacs
  :bind
  (("<f8>"      . treemacs-select-window)
   ("M-0"       . treemacs-select-window)
   ("C-x t t"   . treemacs)
   ("C-x t d"   . treemacs-select-directory)
   ("C-x t B"   . treemacs-bookmark)
   ("C-x t C-t" . treemacs-find-file)
   ("C-x t M-t" . treemacs-find-tag))
  :custom
  (treemacs-width 35)
  (treemacs-is-never-other-window t)
  (treemacs-sorting 'alphabetic-case-insensitive-asc)
  :config
  (treemacs-follow-mode t)
  (treemacs-filewatch-mode t)
  (treemacs-fringe-indicator-mode 'always)
  (treemacs-git-mode 'deferred))

(use-package treemacs-nerd-icons
  :after treemacs
  :config
  (cond
   ((not (display-graphic-p))
    (treemacs-load-theme "nerd-icons"))
   ((find-font (font-spec :family nerd-icons-font-family))
    (treemacs-load-theme "nerd-icons"))
   (t
    (message "Treemacs: font %S not installed — run M-x nerd-icons-install-fonts to get icons"
             nerd-icons-font-family))))

;; Open treemacs automatically at startup, pointed at the gepisopendata repo root.
(add-hook 'emacs-startup-hook
          (lambda ()
            (let ((default-directory gepis/project-root))
              (treemacs-add-and-display-current-project-exclusively))))


;;; ---------------------------------------------------------------
;; 13b. Antigravity (`agy`) Remote Control integration (Treemacs & Dired)
;;      100% portable Emacs Lisp (Linux & Windows).
;;      Starts/stops remote sessions named after the Treemacs or Dired folder.
;;; ---------------------------------------------------------------

(let ((shared-agy "/run/media/wgn/ext4/Projects-Srcs/Projects-Srcs-Desktop/fzl-emacs/main/src/lispsite/pkgconfig-antigravity.el"))
  (if (file-readable-p shared-agy)
      (load shared-agy nil 'nomessage)
    ;; Self-contained fallback when running on another machine (e.g. Windows)
    (require 'json)
    (defvar fzl/agy-sessions (make-hash-table :test #'equal))
    (defvar fzl/agy-remote-url "https://antigravity.google.com")
    (defun fzl/agy-executable ()
      (or (executable-find "agy")
          (executable-find "agy.exe")
          (seq-find #'file-executable-p
                    (list (expand-file-name "~/.local/bin/agy")
                          (expand-file-name "~/.local/bin/agy.exe")
                          (expand-file-name "~/AppData/Local/Programs/Antigravity/agy.exe")))
          (user-error "Executável `agy' não encontrado no PATH")))
    (defun fzl/agy--treemacs-path-at-point ()
      (when (derived-mode-p 'treemacs-mode)
        (or (and (fboundp 'treemacs--prop-at-point)
                 (ignore-errors (treemacs--prop-at-point :path)))
            (and (fboundp 'treemacs-current-button)
                 (fboundp 'treemacs-button-get)
                 (let ((btn (ignore-errors (treemacs-current-button))))
                   (and btn (ignore-errors (treemacs-button-get btn :path))))))))
    (defun fzl/agy--dired-path-at-point ()
      (when (derived-mode-p 'dired-mode)
        (if (fboundp 'dired-current-directory)
            (dired-current-directory)
          default-directory)))
    (defun fzl/agy-target-directory (&optional prompt)
      (let* ((tp (or (fzl/agy--treemacs-path-at-point)
                     (fzl/agy--dired-path-at-point)))
             (raw (cond ((and (stringp tp) (file-directory-p tp)) tp)
                        ((and (stringp tp) (file-exists-p tp)) (file-name-directory tp))
                        (t default-directory)))
             (res (file-name-as-directory (expand-file-name raw))))
        (if prompt
            (file-name-as-directory (expand-file-name (read-directory-name "Pasta para sessão remota: " res nil t)))
          res)))
    (defun fzl/agy-folder-name (dir)
      (file-name-nondirectory (directory-file-name (expand-file-name dir))))
    (defun fzl/agy-remote-start (&optional prefix)
      (interactive "P")
      (let* ((dir (fzl/agy-target-directory prefix))
             (key (directory-file-name dir))
             (name (fzl/agy-folder-name dir))
             (agy (fzl/agy-executable))
             (buf (get-buffer-create (format "*agy-remote:%s*" name)))
             (default-directory dir)
             (process-environment (if (eq system-type 'gnu/linux)
                                      (cons "OPENSSL_ia32cap=~0x4000000000000000" process-environment)
                                    process-environment))
             (proc (start-process (format "agy-remote-%s" name) buf agy "remote-control" "serve")))
        (set-process-query-on-exit-flag proc nil)
        (puthash key (list :name name :dir dir :process proc :buffer buf :mode 'background) fzl/agy-sessions)
        (message "Antigravity: sessão remota [%s] iniciada em %s" name key)))
    (defun fzl/agy-remote-stop ()
      (interactive)
      (let* ((dir (fzl/agy-target-directory nil))
             (key (directory-file-name dir))
             (sess (gethash key fzl/agy-sessions)))
        (when (and sess (process-live-p (plist-get sess :process)))
          (delete-process (plist-get sess :process)))
        (remhash key fzl/agy-sessions)
        (message "Antigravity: sessão remota parada (%s)." (fzl/agy-folder-name dir))))
    (global-set-key (kbd "C-c a s") #'fzl/agy-remote-start)
    (global-set-key (kbd "C-c a k") #'fzl/agy-remote-stop)))


;;; ---------------------------------------------------------------
;; 14. Useful keybindings summary
;;
;;  Antigravity Remote Control (Treemacs & Global):
;;    C-c a s         — start remote session in Treemacs folder at point (named after folder)
;;    C-c a i         — start interactive remote session in Emacs terminal buffer
;;    C-c a k         — stop remote session for folder at point (or pick from active list)
;;    C-c a K         — stop ALL active remote sessions
;;    C-c a t         — toggle remote session for folder at point
;;    C-c a l         — status/list of active remote sessions
;;    C-c a b         — open session output/terminal buffer
;;    C-c a w         — open https://antigravity.google.com
;;
;;  Rust & Cargo (rust-mode):
;;    Gepis-Rust menu — one-click Cargo Check/Clippy/Build/Test/Run & LSP actions
;;    C-c C-c         — cargo check
;;    C-c C-k         — cargo clippy
;;    C-c C-b         — cargo build
;;    C-c C-t         — cargo test
;;    C-c C-r         — cargo run
;;    C-c C-f         — format current Rust buffer (rustfmt / eglot)
;;
;;  LSP / rust-analyzer (Eglot, starts automatically in .rs files):
;;    M-.             — jump to definition (xref-find-definitions)
;;    M-,             — pop back from definition
;;    M-?             — find references (xref-find-references)
;;    M-n / M-p       — next / previous compiler or clippy diagnostic (Flymake)
;;    C-c l a         — execute LSP code action / quick fix (eglot-code-actions)
;;    C-c l r         — rename symbol across workspace (eglot-rename)
;;    C-c l d         — open full documentation buffer for symbol at point
;;
;;  Autocomplete popup (Corfu — appears automatically while typing):
;;    TAB             — accept the highlighted candidate
;;    C-n / C-p       — next / previous candidate (arrow keys work too)
;;    RET             — inserts a newline (does not accidentally complete)
;;    C-g             — dismiss the popup
;;    M-t             — toggle rustdoc documentation popup
;;
;;  Treemacs (file/directory sidebar, opens automatically at startup):
;;    <f8> / M-0      — jump to the treemacs window
;;    C-x t t         — open/close treemacs
;;    C-x t C-t       — reveal current file in treemacs
;;
;;  Magit (Git porcelain):
;;    C-x g           — open magit-status
;;; ---------------------------------------------------------------

(provide 'init)
;;; init.el ends here
