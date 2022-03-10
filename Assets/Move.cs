using UnityEngine;

public class Move : MonoBehaviour
{
    public float speed = 2;
    private bool beenHit = false;

    private void Update()
    {
        transform.position -= Time.deltaTime * transform.forward * speed;

        if (transform.position.z < -2.0f)
        {
            FindObjectOfType<Scoreboard>().IncreaseMisses();
            Destroy(gameObject);
        }
    }
}
