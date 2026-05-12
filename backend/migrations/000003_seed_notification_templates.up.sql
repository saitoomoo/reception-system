INSERT INTO notification_templates (key, title, body, icon_url) VALUES
  (
    'application_completed',
    '整理券を取得しました',
    '{{ニックネーム}} さん、{{ブース名}} の整理券を取得しました。順番が近づきましたらお知らせします。',
    NULL
  ),
  (
    'call_initial',
    '{{ブース名}} - 呼び出し',
    '{{ニックネーム}} さん、お時間です。{{場所}} へお越しください。',
    NULL
  ),
  (
    'call_resent',
    '{{ブース名}} - お時間です',
    '{{ニックネーム}} さん、お時間ある時にいつでもお越しください。{{場所}} でお待ちしています。',
    NULL
  ),
  (
    'cancelled_by_staff',
    '{{ブース名}} - キャンセル',
    '{{ニックネーム}} さん、{{ブース名}} の整理券がキャンセルされました。',
    NULL
  )
ON CONFLICT (key) DO NOTHING;
